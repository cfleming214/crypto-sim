// Create N featured XP contests (live now, fixed duration). Writes Competition
// rows directly to DynamoDB, mirroring create-rolling-contest's shape.
//
//   node scripts/create-contests.mjs --count 5 --hours 1 --xp 5000 --max-players 30
//
// Reads region/table from amplify_outputs.json + a live DynamoDB list. Admin creds.
import { DynamoDBClient, ListTablesCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const COUNT = parseInt(flag('--count', '5'), 10);
const HOURS = parseFloat(flag('--hours', '1'));
const XP = parseInt(flag('--xp', '5000'), 10);
const MAX_PLAYERS = parseInt(flag('--max-players', '30'), 10);

const out = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const ddb = new DynamoDBClient({ region: out.data?.aws_region ?? out.auth.aws_region });

async function findTable(needle) {
  let start, hit;
  do { const r = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: start })); hit = (r.TableNames ?? []).find(t => t.includes(needle)); start = r.LastEvaluatedTableName; } while (!hit && start);
  return hit;
}

(async () => {
  const table = await findTable('Competition-');
  const now = Date.now();
  const stamp = now.toString(36);
  const label = HOURS === 1 ? '1-Hour Sprint' : Number.isInteger(HOURS) ? `${HOURS}-Hour Sprint` : `${HOURS}h Sprint`;
  console.log(`Creating ${COUNT} × "${label}" · ${XP.toLocaleString()} XP · ${HOURS}h · maxPlayers ${MAX_PLAYERS}\n  table ${table}`);
  for (let i = 1; i <= COUNT; i++) {
    const id = `1h-${stamp}-${i}`;
    const nowIso = new Date(now).toISOString();
    await ddb.send(new PutItemCommand({
      TableName: table,
      Item: marshall({
        id,
        __typename: 'Competition',
        name: `⚡ ${label} #${i}`,
        type: 'featured',
        status: 'live',
        prizePool: '',
        maxPlayers: MAX_PLAYERS,
        stake: 'Free',
        startAt: nowIso,
        endAt: new Date(now + HOURS * 3600 * 1000).toISOString(),
        entryCount: 0,
        prizeXp: XP,
        numberOfPrizes: 3,
        prizesJson: '[]',
        cashPrize: false,
        lockAfterStart: false,
        createdBy: 'manual-seed',
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    console.log(`  ✓ ${id}  ⚡ ${label} #${i}  (ends ${new Date(now + HOURS * 3600 * 1000).toISOString()})`);
  }
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
