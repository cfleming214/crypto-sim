import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Runs on EventBridge schedule every 10 minutes.
// Closes any 'live' competitions whose endAt has passed.
export const handler = async (): Promise<void> => {
  const compTable = process.env.COMPETITION_TABLE_NAME;
  const entryTable = process.env.COMPETITION_ENTRY_TABLE_NAME;
  if (!compTable || !entryTable) throw new Error('Table env vars not set');

  const now = new Date().toISOString();

  const { Items = [] } = await ddb.send(new ScanCommand({
    TableName: compTable,
    FilterExpression: '#s = :live AND endAt <= :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: marshall({ ':live': 'live', ':now': now }),
  }));

  for (const raw of Items) {
    const comp = unmarshall(raw) as { id: string };

    // Mark competition finished
    await ddb.send(new UpdateItemCommand({
      TableName: compTable,
      Key: marshall({ id: comp.id }),
      UpdateExpression: 'SET #s = :finished',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: marshall({ ':finished': 'finished' }),
    }));

    // Mark all entries inactive
    const { Items: entryItems = [] } = await ddb.send(new ScanCommand({
      TableName: entryTable,
      FilterExpression: 'competitionId = :cid',
      ExpressionAttributeValues: marshall({ ':cid': comp.id }),
    }));
    await Promise.all(entryItems.map(rawEntry => {
      const entry = unmarshall(rawEntry) as { id: string };
      return ddb.send(new UpdateItemCommand({
        TableName: entryTable,
        Key: marshall({ id: entry.id }),
        UpdateExpression: 'SET isActive = :f',
        ExpressionAttributeValues: marshall({ ':f': false }),
      }));
    }));
  }
};
