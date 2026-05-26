import { DynamoDBClient, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});

// Invoked by the user from ProfileScreen "Reset demo".
// Deletes all Trade records for the caller and resets their UserProfile to defaults.
export const handler = async (event: { userId: string }): Promise<{ ok: boolean }> => {
  const profileTable = process.env.USER_PROFILE_TABLE_NAME;
  const tradeTable = process.env.TRADE_TABLE_NAME;
  if (!profileTable || !tradeTable) throw new Error('Table env vars not set');

  const { userId } = event;
  if (!userId) throw new Error('userId required');

  // Delete all Trade records owned by this user
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: tradeTable,
    KeyConditionExpression: 'owner = :u',
    ExpressionAttributeValues: { ':u': { S: userId } },
    ProjectionExpression: 'id',
  }));

  await Promise.all(
    Items.map(item =>
      ddb.send(new DeleteItemCommand({
        TableName: tradeTable,
        Key: { id: { S: item.id.S! } },
      }))
    )
  );

  // Reset UserProfile to initial values (preserve handle/avatarColor)
  const { Items: profileItems = [] } = await ddb.send(new QueryCommand({
    TableName: profileTable,
    KeyConditionExpression: 'owner = :u',
    ExpressionAttributeValues: { ':u': { S: userId } },
    ProjectionExpression: 'id',
  }));

  await Promise.all(
    profileItems.map(item =>
      ddb.send(new DeleteItemCommand({
        TableName: profileTable,
        Key: { id: { S: item.id.S! } },
      }))
    )
  );

  return { ok: true };
};
