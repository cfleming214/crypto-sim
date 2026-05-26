import { DynamoDBClient, GetItemCommand, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

interface TradeRequest {
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
}

// Server-side trade validation and execution.
// Called from client instead of doing purely client-side mutations.
// Validates available cash/holdings and applies slippage before persisting.
export const handler = async (event: TradeRequest): Promise<{ ok: boolean; trade?: object; error?: string }> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tradeTable   = process.env.TRADE_TABLE_NAME;
  if (!profileTable || !tradeTable) throw new Error('Table env vars not set');

  const { userId, symbol, side, amount, price } = event;

  // Load profile
  const { Items: profileItems = [] } = await ddb.send(new GetItemCommand({
    TableName: profileTable,
    Key: marshall({ owner: userId }),
  }) as any);

  if (!profileItems.length) return { ok: false, error: 'Profile not found' };
  const profile = unmarshall(profileItems[0] as any) as { cash: number; holdingsJson: string };
  const holdings: { symbol: string; units: number; avgCost: number }[] = JSON.parse(profile.holdingsJson || '[]');

  const slippage = 0.001; // 0.1%
  const effectivePrice = side === 'buy' ? price * (1 + slippage) : price * (1 - slippage);
  const units = amount / effectivePrice;

  if (side === 'buy') {
    if (profile.cash < amount) return { ok: false, error: 'Insufficient cash' };
    const newCash = profile.cash - amount;
    const existing = holdings.find(h => h.symbol === symbol);
    const newHoldings = existing
      ? holdings.map(h => h.symbol === symbol
          ? { ...h, units: h.units + units, avgCost: (h.avgCost * h.units + amount) / (h.units + units) }
          : h)
      : [...holdings, { symbol, units, avgCost: effectivePrice }];
    await ddb.send(new UpdateItemCommand({
      TableName: profileTable,
      Key: marshall({ owner: userId }),
      UpdateExpression: 'SET cash = :c, holdingsJson = :h',
      ExpressionAttributeValues: marshall({ ':c': newCash, ':h': JSON.stringify(newHoldings) }),
    }) as any);
  } else {
    const holding = holdings.find(h => h.symbol === symbol);
    if (!holding || holding.units < units) return { ok: false, error: 'Insufficient holdings' };
    const proceeds = units * effectivePrice;
    const newHoldings = holding.units - units < 0.000001
      ? holdings.filter(h => h.symbol !== symbol)
      : holdings.map(h => h.symbol === symbol ? { ...h, units: h.units - units } : h);
    await ddb.send(new UpdateItemCommand({
      TableName: profileTable,
      Key: marshall({ owner: userId }),
      UpdateExpression: 'SET cash = :c, holdingsJson = :h',
      ExpressionAttributeValues: marshall({ ':c': profile.cash + proceeds, ':h': JSON.stringify(newHoldings) }),
    }) as any);
  }

  const tradeId = `SIM-${Date.now().toString(36).toUpperCase()}`;
  const trade = { id: tradeId, owner: userId, symbol, side, amount, units, price: effectivePrice, slippage, timestamp: new Date().toISOString(), xpEarned: side === 'buy' ? 25 : 10 };
  await ddb.send(new PutItemCommand({ TableName: tradeTable, Item: marshall(trade) }));

  return { ok: true, trade };
};
