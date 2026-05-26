import { DynamoDBClient, QueryCommand, GetItemCommand, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
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

    // Find all copiers who are mirroring this trader
    const { Items: mirrors = [] } = await ddb.send(new QueryCommand({
      TableName: mirrorTable,
      IndexName: 'leaderId-index',
      KeyConditionExpression: 'leaderId = :lid AND active = :t',
      ExpressionAttributeValues: marshall({ ':lid': trade.owner, ':t': true }),
    }) as any);

    for (const mirrorItem of mirrors) {
      const mirror = unmarshall(mirrorItem as any) as { followerId: string; allocation: number; maxPositionPct: number };

      // Load follower profile
      const { Items: followerItems = [] } = await ddb.send(new GetItemCommand({
        TableName: profileTable,
        Key: marshall({ owner: mirror.followerId }),
      }) as any);
      if (!followerItems.length) continue;

      const follower = unmarshall(followerItems[0] as any) as { cash: number; bankroll: number; holdingsJson: string };
      const mirroredAmount = Math.min(
        trade.amount * (mirror.allocation / follower.bankroll),
        mirror.allocation * mirror.maxPositionPct,
      );
      if (mirroredAmount < 1) continue;

      // Execute mirrored trade on follower profile
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
        }) as any);

        const mirroredTradeId = `MRR-${Date.now().toString(36).toUpperCase()}`;
        await ddb.send(new PutItemCommand({
          TableName: tradeTable,
          Item: marshall({ id: mirroredTradeId, owner: mirror.followerId, symbol: trade.symbol, side: 'buy', amount: mirroredAmount, units, price: trade.price, slippage: 0.001, timestamp: new Date().toISOString(), xpEarned: 5, mirroredFrom: trade.owner }),
        }));
      }
    }
  }
};
