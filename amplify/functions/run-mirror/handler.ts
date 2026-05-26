import { DynamoDBClient, ScanCommand, GetItemCommand, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Triggered by DynamoDB stream on Trade table.
// When the leader makes a trade, proportionally mirrors it to all active copiers.
export const handler = async (event: { Records: any[] }): Promise<void> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tradeTable   = process.env.TRADE_TABLE_NAME;
  const mirrorTable  = process.env.MIRROR_TABLE_NAME;
  if (!profileTable || !tradeTable || !mirrorTable) return;

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue;
    const trade = unmarshall(record.dynamodb.NewImage) as {
      owner: string; symbol: string; side: string; amount: number; price: number;
    };

    // Skip mirrored trades to prevent cascading mirrors
    if ((trade as any).mirroredFrom) continue;

    // Find all active copiers who are mirroring this trader
    const { Items: mirrors = [] } = await ddb.send(new ScanCommand({
      TableName: mirrorTable,
      FilterExpression: 'leaderId = :lid AND active = :t',
      ExpressionAttributeValues: marshall({ ':lid': trade.owner, ':t': true }),
    }));

    for (const mirrorItem of mirrors) {
      const mirror = unmarshall(mirrorItem) as { followerId: string; allocation: number; maxPositionPct: number };

      const { Item: followerItem } = await ddb.send(new GetItemCommand({
        TableName: profileTable,
        Key: marshall({ owner: mirror.followerId }),
      }));
      if (!followerItem) continue;

      const follower = unmarshall(followerItem) as { cash: number; bankroll: number; holdingsJson: string };
      const allocation = mirror.allocation ?? 0;
      const maxPct     = mirror.maxPositionPct ?? 0.25;
      const mirroredAmount = Math.min(
        trade.amount * (allocation / (follower.bankroll || 1)),
        allocation * maxPct,
      );
      if (mirroredAmount < 1) continue;

      const holdings: { symbol: string; units: number; avgCost: number }[] = JSON.parse(follower.holdingsJson || '[]');
      const units = mirroredAmount / trade.price;

      if (trade.side === 'buy' && follower.cash >= mirroredAmount) {
        const existing = holdings.find(h => h.symbol === trade.symbol);
        const newHoldings = existing
          ? holdings.map(h => h.symbol === trade.symbol
              ? { ...h, units: h.units + units, avgCost: (h.avgCost * h.units + mirroredAmount) / (h.units + units) }
              : h)
          : [...holdings, { symbol: trade.symbol, units, avgCost: trade.price }];

        await ddb.send(new UpdateItemCommand({
          TableName: profileTable,
          Key: marshall({ owner: mirror.followerId }),
          UpdateExpression: 'SET cash = :c, holdingsJson = :h',
          ExpressionAttributeValues: marshall({
            ':c': follower.cash - mirroredAmount,
            ':h': JSON.stringify(newHoldings),
          }),
        }));

        await ddb.send(new PutItemCommand({
          TableName: tradeTable,
          Item: marshall({
            id: `MRR-${Date.now().toString(36).toUpperCase()}`,
            owner: mirror.followerId,
            symbol: trade.symbol,
            side: 'buy',
            amount: mirroredAmount,
            units,
            price: trade.price,
            slippage: 0.001,
            timestamp: new Date().toISOString(),
            xpEarned: 5,
            mirroredFrom: trade.owner,
          }),
        }));
      } else if (trade.side === 'sell') {
        const existing = holdings.find(h => h.symbol === trade.symbol);
        if (!existing || existing.units < units) continue;

        const newHoldings = existing.units - units < 0.000001
          ? holdings.filter(h => h.symbol !== trade.symbol)
          : holdings.map(h => h.symbol === trade.symbol ? { ...h, units: h.units - units } : h);

        await ddb.send(new UpdateItemCommand({
          TableName: profileTable,
          Key: marshall({ owner: mirror.followerId }),
          UpdateExpression: 'SET cash = :c, holdingsJson = :h',
          ExpressionAttributeValues: marshall({
            ':c': follower.cash + mirroredAmount,
            ':h': JSON.stringify(newHoldings),
          }),
        }));

        await ddb.send(new PutItemCommand({
          TableName: tradeTable,
          Item: marshall({
            id: `MRR-${Date.now().toString(36).toUpperCase()}`,
            owner: mirror.followerId,
            symbol: trade.symbol,
            side: 'sell',
            amount: mirroredAmount,
            units,
            price: trade.price,
            slippage: 0.001,
            timestamp: new Date().toISOString(),
            xpEarned: 5,
            mirroredFrom: trade.owner,
          }),
        }));
      }
    }
  }
};
