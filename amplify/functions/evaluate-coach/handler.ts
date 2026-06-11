import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

interface HoldingRecord { symbol: string; units: number; avgCost: number }

// Triggered by DynamoDB stream on Trade table after each trade.
// Evaluates portfolio risk and writes CoachNudge records.
export const handler = async (event: { Records: any[] }): Promise<void> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const nudgeTable   = process.env.COACH_NUDGE_TABLE_NAME;
  if (!profileTable || !nudgeTable) return;

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue;
    const trade = unmarshall(record.dynamodb.NewImage) as { owner: string; symbol: string };
    const owner = trade.owner;
    if (!owner) continue;

    const { Items = [] } = await ddb.send(new QueryCommand({
      TableName: profileTable,
      KeyConditionExpression: 'owner = :u',
      ExpressionAttributeValues: { ':u': { S: owner } },
      Limit: 1,
    }));
    if (!Items.length) continue;

    const profile = unmarshall(Items[0]) as {
      bankroll: number; cash: number; holdingsJson?: string; stopLossesJson?: string;
    };
    const holdings: HoldingRecord[] = profile.holdingsJson ? JSON.parse(profile.holdingsJson) : [];
    const bankroll = profile.bankroll ?? 100000;
    const cash = profile.cash ?? 0;
    const stopLosses: Record<string, number> = profile.stopLossesJson ? JSON.parse(profile.stopLossesJson) : {};

    const nudges: { message: string; severity: string }[] = [];

    for (const h of holdings) {
      const pct = (h.units * h.avgCost) / bankroll;
      if (pct > 0.4) nudges.push({ message: `${h.symbol} is ${Math.round(pct * 100)}% of your portfolio — consider trimming`, severity: 'warn' });
      if (!stopLosses[h.symbol]) nudges.push({ message: `No stop-loss set on ${h.symbol}`, severity: 'warn' });
    }
    if (cash / bankroll < 0.05) nudges.push({ message: 'Cash buffer below 5% — limited buying power', severity: 'warn' });

    for (const nudge of nudges.slice(0, 2)) {
      await ddb.send(new PutItemCommand({
        TableName: nudgeTable,
        Item: marshall({
          id: `${owner}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          owner,
          message: nudge.message,
          severity: nudge.severity,
          createdAt: new Date().toISOString(),
          dismissed: false,
        }),
      }));
    }
  }
};
