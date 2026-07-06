// logic/rivals.js — the seven rivals: stats, personalities, taunt lines.
// Pure data + pickTaunt. Only sim.js imports this.

import { pick } from '../util.js';

export const RIVALS = [
  {
    id: 'sledge', name: 'SLEDGE', color: 0xd4452a,
    personality: 'aggressive', baseSkill: 0.8, startWeapon: 'club',
    taunts: {
      overtake: ['Eat my heat haze.', 'Move it, organ donor.', 'That all your bike does?'],
      knockdown: ['Asphalt tastes free.', 'Stay down, saves us both time.', 'Told you the road was mine.'],
      hit: ['That tickled. My turn.', 'You hit like a moped.', 'Now I\'m awake. Bad news.'],
      grudge: ['I remember you. So does my club.', 'Been saving a dent for you.'],
    },
  },
  {
    id: 'vex', name: 'VEX', color: 0x7a3ae8,
    personality: 'dirty', baseSkill: 0.7, startWeapon: 'chain',
    taunts: {
      overtake: ['Smell ya later. Literally.', 'Mirrors are for cowards.', 'Bye bye, speed bump.'],
      knockdown: ['Oops. Chain slipped.', 'Gravity\'s on my payroll.', 'Nap time, sunshine.'],
      hit: ['Cute. Now bleed.', 'I keep receipts.', 'You just made my list.'],
      grudge: ['Still owe you a face full of chain.', 'This one\'s personal, peach.'],
    },
  },
  {
    id: 'kilowatt', name: 'MAMA KILOWATT', color: 0xf5b642,
    personality: 'wildcard', baseSkill: 0.75, startWeapon: null,
    taunts: {
      overtake: ['Kisses, baby!', 'Mama\'s got errands to run.', 'Left lane\'s for winners, hon.'],
      knockdown: ['Sweep the leg? Swept the whole boy.', 'Bless your little heart.', 'Somebody call his mother. Oh wait.'],
      hit: ['Rude! I raised wolves nicer than you.', 'That\'s coming out of your hide.', 'Ha! Do it again, I dare ya.'],
      grudge: ['Mama never forgets, sugar.', 'You broke my nail. I break you.'],
    },
  },
  {
    id: 'preacher', name: 'PREACHER', color: 0xe8e0d0,
    personality: 'racer', baseSkill: 0.95, startWeapon: null,
    taunts: {
      overtake: ['The road provides. To me.', 'Repent at the next exit.', 'Witness perfection, brother.'],
      knockdown: ['Ashes to ashes, punk.', 'The meek inherit the ditch.', 'Consider yourself baptized.'],
      hit: ['Violence? On MY sermon?', 'Forgiveness is for pedestrians.', 'You will know wrath.'],
      grudge: ['I prayed on it. Answer\'s still no mercy.', 'Your sins found you, brother.'],
    },
  },
  {
    id: 'dice', name: 'DICE', color: 0x3ac86a,
    personality: 'wildcard', baseSkill: 0.65, startWeapon: null,
    taunts: {
      overtake: ['Snake eyes, sucker!', 'House always wins, baby.', 'Bet you didn\'t see that coming.'],
      knockdown: ['Craps! You lose.', 'Double or nothing? Nothing it is.', 'Cash out, tough guy.'],
      hit: ['Hey! I bruise like a banana!', 'Wild card, remember?', 'Odds just moved against you.'],
      grudge: ['Owe you one. With interest.', 'Rolling for your teeth this time.'],
    },
  },
  {
    id: 'roxy', name: 'ROXY STANDOFF', color: 0xe83a9e,
    personality: 'dirty', baseSkill: 0.85, startWeapon: null,
    taunts: {
      overtake: ['Watch the paint, sweetheart.', 'You ride like a tourist.', 'Ciao, slowpoke.'],
      knockdown: ['Boot to the head. Classic.', 'Stay down where it\'s safe.', 'That heel cost more than your bike.'],
      hit: ['Wrong girl. Wrong day.', 'Now it\'s a standoff.', 'You scuffed me. Big mistake.'],
      grudge: ['Nobody drops Roxy twice.', 'I braided a chain just for you.'],
    },
  },
  {
    id: 'kaz', name: 'KAZ', color: 0x3a8ae8,
    personality: 'racer', baseSkill: 0.9, startWeapon: null,
    taunts: {
      overtake: ['Clean line. Try it sometime.', 'You brake too early, friend.', 'Speed is honesty.'],
      knockdown: ['You forced my hand.', 'Sloppy. Predictable. Horizontal.', 'Race the road, not me.'],
      hit: ['Unwise.', 'I was being polite. Was.', 'Fine. We do it your way.'],
      grudge: ['You cost me a podium once.', 'I never lose to the same rider twice.'],
    },
  },
];

export function pickTaunt(rivalDef, kind, rng) {
  const lines = rivalDef.taunts[kind] || rivalDef.taunts.overtake;
  return pick(rng, lines);
}
