import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Runs on EventBridge schedule every 5 minutes.
// Re-ranks all active CompetitionEntry records by bankroll within each competition.
export const handler = async (): Promise<void> => {
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!entryTable) throw new Error('COMPETITION_ENTRY_TABLE_NAME not set');

  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: entryTable,
    FilterExpression: 'isActive = :t',
    ExpressionAttributeValues: { ':t': { BOOL: true } },
  }));

  const entries = Items.map(i => unmarshall(i) as {
    id: string; competitionId: string; bankroll: number;
  });

  // Group by competition
  const byComp: Record<string, typeof entries> = {};
  for (const e of entries) {
    (byComp[e.competitionId] ??= []).push(e);
  }

  // Sort by bankroll desc and write back updated ranks
  for (const compEntries of Object.values(byComp)) {
    compEntries.sort((a, b) => (b.bankroll ?? 0) - (a.bankroll ?? 0));
    await Promise.all(compEntries.map((entry, i) =>
      ddb.send(new UpdateItemCommand({
        TableName: entryTable,
        Key: marshall({ id: entry.id }),
        UpdateExpression: 'SET #rnk = :rnk',
        ExpressionAttributeNames: { '#rnk': 'rank' },
        ExpressionAttributeValues: marshall({ ':rnk': i + 1 }),
      })),
    ));
  }
};
