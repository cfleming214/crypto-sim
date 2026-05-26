/**
 * Seed competitions into DynamoDB via AppSync.
 * Run after `npx ampx sandbox` has deployed the backend:
 *
 *   npx ts-node -e "require('./scripts/seedCompetitions')"
 *
 * Or add to package.json scripts: "seed": "ts-node scripts/seedCompetitions.ts"
 */
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
// @ts-ignore — generated after `npx ampx sandbox`
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);
const client = generateClient<any>();

const NOW = new Date();
const addHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();
const addDays  = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const competitions = [
  {
    name: 'Weekend Warriors',
    type: 'featured',
    status: 'live',
    prizePool: '$5,000',
    maxPlayers: 2000,
    stake: 'Free',
    startAt: new Date(NOW.getTime() - 24 * 3600_000).toISOString(),
    endAt: addHours(2.25),
    entryCount: 1284,
  },
  {
    name: 'Quick Sprint',
    type: 'daily',
    status: 'open',
    prizePool: '500 XP',
    maxPlayers: 500,
    stake: 'Free',
    startAt: NOW.toISOString(),
    endAt: addHours(5),
    entryCount: 0,
  },
  {
    name: 'Memecoin Mania',
    type: 'featured',
    status: 'open',
    prizePool: '$500',
    maxPlayers: 1000,
    stake: '100 XP',
    startAt: addHours(2),
    endAt: addDays(2),
    entryCount: 0,
  },
  {
    name: "Bull Run '21",
    type: 'replay',
    status: 'open',
    prizePool: '$2,000',
    maxPlayers: 500,
    stake: '500 XP',
    startAt: NOW.toISOString(),
    endAt: addDays(7),
    entryCount: 0,
  },
  {
    name: 'Quick Match',
    type: '1v1',
    status: 'open',
    prizePool: 'XP',
    maxPlayers: 2,
    stake: 'Free',
    startAt: NOW.toISOString(),
    endAt: addHours(0.5),
    entryCount: 0,
  },
];

async function seed() {
  for (const comp of competitions) {
    const { data, errors } = await client.models.Competition.create(comp);
    if (errors?.length) {
      console.error(`Failed to create ${comp.name}:`, errors);
    } else {
      console.log(`Created: ${comp.name} (${(data as { id?: string } | null)?.id ?? '?'})`);
    }
  }
  console.log('Seeding complete.');
}

seed().catch(console.error);
