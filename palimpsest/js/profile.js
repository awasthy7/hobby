// PALIMPSEST — the quiet observer. The game watches how you play:
// which words you choose, what you cling to, how patiently you move.
// At the end, P.poem.compose() turns the profile into a poem about the player.

P.profile = {
  data: null,

  fresh() {
    this.data = {
      name: null,
      startedAt: Date.now(),
      playSeconds: 0,
      folio: 0,                 // highest completed folio (1-7)
      collected: [],            // every word the player has gathered, in order
      flux: [],                 // river choices: {chose, over}
      book: null,               // 'happened' | 'should'
      shadows: [],              // acceptance order
      patienceSamples: [],
      seeds: [],
      wateredMost: null,
      graspCount: 0,
      releasedCount: 0,
      savedWord: null,
      why: null,
      expectedSeconds: 0,       // sum of expected folio durations, for linger score
    };
    return this.data;
  },

  collect(text) {
    if (!this.data.collected.includes(text)) this.data.collected.push(text);
  },

  save() {
    try { localStorage.setItem('palimpsest.v1', JSON.stringify(this.data)); } catch (e) {}
  },
  load() {
    try {
      const raw = localStorage.getItem('palimpsest.v1');
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d && typeof d.folio === 'number' && d.folio >= 1 && d.folio < 7) { this.data = d; return d; }
    } catch (e) {}
    return null;
  },
  clear() { try { localStorage.removeItem('palimpsest.v1'); } catch (e) {} },

  // A plausible profile so any folio can be jumped to directly (?folio=name).
  mock() {
    const d = this.fresh();
    d.name = null;
    d.collected = ['current', 'glimmer', 'threshold', 'elsewhere', 'almost', 'ember',
      'undertow', 'north', 'lantern', 'sooner', 'grief', 'want', 'fear', 'envy', 'anger',
      'wonder', 'silence', 'courage', 'spring', 'rest'];
    d.flux = [{ chose: 'current', over: 'stone' }, { chose: 'hold', over: 'release' }, { chose: 'become', over: 'remain' }];
    d.book = 'should';
    d.shadows = ['grief', 'want', 'fear', 'envy', 'anger'];
    d.patienceSamples = [40, 55, 38];
    d.seeds = ['wonder', 'silence', 'courage', 'spring', 'rest'];
    d.wateredMost = 'silence';
    d.graspCount = 5; d.releasedCount = 6; d.savedWord = 'ember';
    d.why = 'unknown';
    d.playSeconds = 900; d.expectedSeconds = 800;
    return d;
  },
};

// ---------------------------------------------------------------------------
// The poem. Assembled from the profile — every playthrough reads differently.
// ---------------------------------------------------------------------------
P.poem = {
  compose(d) {
    const rnd = P.seededRandom(P.hashString(JSON.stringify([d.name, d.seeds, d.shadows, d.flux, d.why])));
    const em = w => `*${w}*`;
    const L = [];
    const push = (...lines) => { L.push(...lines); };
    const gap = () => { if (L.length && L[L.length - 1] !== '') L.push(''); };

    // -- pace --
    const linger = d.expectedSeconds > 0 ? d.playSeconds / d.expectedSeconds : 1;
    if (linger > 1.3) {
      push('You are the kind of reader who stays —',
        'who waits in the emptied theater',
        'to hear what the silence thought of the play.',
        'The manuscript noticed. Manuscripts always notice.');
    } else if (linger < 0.75) {
      push('You move like weather through a house of open windows —',
        'curtains lifting in every room at once.',
        'Some souls read the world by standing still.',
        'You read it at the speed of wanting,',
        'and the world, flattered, kept up.');
    } else {
      push('You walked the way honest people write:',
        'not fast, not slow —',
        'at the pace of someone who intends',
        'to arrive changed.');
    }

    // -- the river --
    gap();
    const fluxWords = ['current', 'release', 'become'];
    const fluxScore = d.flux.filter(c => fluxWords.includes(c.chose)).length;
    if (fluxScore >= 3) {
      push('Offered stone, you chose current.',
        'Offered hold, you chose release.',
        'Three times the river asked its one question',
        `and three times you answered ${em('become')}.`,
        'You already know the secret, then:',
        'nothing is lost by flowing.',
        'It is only lost by clutching.');
    } else if (fluxScore === 0) {
      push('The river offered you its going',
        'and every time, you chose the stone.',
        'There is a loyalty in you older than water —',
        'you are the thing the current happens around,',
        'and rivers, secretly, are grateful',
        'for what refuses them.');
    } else {
      push('Half of you is river, half is bank.',
        'You keep one foot in the going',
        'and one in the ground —',
        'the oldest way of being torn,',
        'and the only way of being a bridge.');
    }

    // -- the archive --
    gap();
    if (d.book === 'should') {
      push('In the archive you chose the book',
        `of ${em('what should have happened')}.`,
        'Of course you did.',
        'That book has one author and one reader',
        'and you have been both all your life.');
    } else if (d.book === 'happened') {
      push('In the archive you chose the book',
        `of ${em('what happened')} — the unrevised edition,`,
        'water-stained, true.',
        'Braver than it looks, that choice.',
        'Most people live their whole lives in the other book.');
    }

    // -- the shadow --
    gap();
    const first = d.shadows[0] || 'grief';
    const patience = d.patienceSamples.length
      ? d.patienceSamples.reduce((a, b) => a + b, 0) / d.patienceSamples.length : 60;
    const patLine = patience < 65
      ? 'In the dark you moved like someone approaching a deer.'
      : 'Even the dark could not slow you, though it tried.';
    const epithets = {
      envy: ['— envy, which is only admiration', 'that hasn’t forgiven itself yet.'],
      fear: ['— fear, which is imagination', 'pledging allegiance to the wrong future.'],
      grief: ['— grief, which is love', 'with nowhere to put its hands.'],
      anger: ['— anger, which is a boundary', 'that finally found its voice.'],
      want: ['— want, which you were taught to whisper,', 'and which was never once ashamed of you.'],
    };
    push(patLine,
      `Five shadows waited, and you went to ${em(first)} first.`,
      'Understand what that means:',
      'of everything you keep in the cellar,',
      `${em(first)} is the one that wanted daylight most`,
      ...(epithets[first] || []));

    // -- the garden --
    if (d.seeds.length) {
      gap();
      const seedList = d.seeds.map(em);
      const last = seedList.pop();
      push('Eight seeds were offered. You planted',
        `${seedList.join(', ')}, ${last} —`,
        'a stranger reading your garden',
        'would know you before your name.');
      const water = {
        patience: [`And you watered ${em('patience')} longest,`, 'which is how patience works:', 'it is the watering.'],
        hunger: [`And you watered ${em('hunger')} most. Keep it alive —`, 'a fed hunger dies into comfort,', 'and comfort writes nothing.'],
        wonder: [`${em('Wonder')} got the most of your light:`, 'the one seed that never grows up,', 'only outward.'],
        rest: [`And you watered ${em('rest')} the longest.`, 'Someone taught you rest must be earned.', 'Unlearn that here.'],
        courage: [`${em('Courage')} drank most from your hands —`, 'not the loud kind. The kind', 'that plants gardens in the dark.'],
        mischief: [`And you watered ${em('mischief')} most, thank god.`, 'Every solemn garden needs', 'one weed that laughs.'],
        silence: [`${em('Silence')} got your longest watering.`, 'Writers know: it is the only soil', 'words actually grow in.'],
        spring: [`And you watered ${em('spring')} the longest —`, 'the seed that is mostly promise.', 'You believe in aprils you cannot prove.'],
      };
      if (d.wateredMost && water[d.wateredMost]) push(...water[d.wateredMost]);
    }

    // -- the tide --
    gap();
    if (d.graspCount === 0) {
      push('When the tide came for your words',
        'you opened your hands — first try, no lessons needed.',
        'The sea remembers who fights her.',
        'She remembers longer who doesn’t.',
        'Somewhere tonight she is telling the other tides about you.');
    } else if (d.graspCount <= 3) {
      push('You saved a few words from the tide —',
        `${em(d.savedWord || 'one')}, mostly — then stood back`,
        'and let the sea do her work.',
        'That is not weakness. That is triage:',
        'every writer drowns; the good ones choose',
        'which page to hold above the water.');
    } else {
      push(`You dragged ${em(d.savedWord || 'a word')} up the beach`,
        `${d.graspCount} times. The tide took it anyway —`,
        'but write this down, because it matters:',
        'you are someone who carries things.',
        'The carrying, not the keeping, was the point.');
    }

    // -- the night --
    gap();
    const whys = {
      light: ['You said you keep going because the light might be real.',
        `${em('Might')} is doing holy work in that sentence.`, 'Keep it.'],
      walking: ['You said you keep going because walking is what you are.',
        'Camus wanted a word with you —',
        'something about imagining you happy.',
        'He didn’t have to imagine hard.'],
      someone: ['You said someone once walked for you.',
        'They knew, even then, how you’d repay it:',
        'by carrying a lamp into the dark',
        'for a stranger you will never meet.'],
      unknown: ['When the night asked why you keep going,',
        `you said: ${em('I don’t know.')}`,
        'Write that on everything.',
        'It is the only answer', 'that has never once been a lie.'],
    };
    push(...(whys[d.why] || whys.unknown));

    // -- the name --
    gap();
    if (d.name) {
      push(`${d.name} — even your name is a palimpsest:`,
        'someone said it before you wore it,',
        'someone will say it after,',
        'and you have been re-inking it your whole life',
        `until it means ${em('you')}.`);
    } else {
      push('You never told the manuscript your name.',
        'Good.',
        'The oldest texts are anonymous,',
        'and every reader becomes them.');
    }

    // -- closing --
    gap();
    push('This page was blank when you arrived.',
      'It was never blank.',
      'Under every word you chose tonight',
      'there is an older word, and under that, an older —',
      'you have been writing this manuscript all your life.',
      'We only held the lamp.');

    return {
      title: d.name ? d.name : 'To the Reader',
      sub: 'a palimpsest, taken down as you walked',
      lines: L,
      colophon: this.colophon(d),
    };
  },

  colophon(d) {
    const now = new Date();
    const h = now.getHours();
    const timePhrase =
      h < 5 ? 'in the smallest hours, when only the honest are awake' :
      h < 9 ? 'at first light, before the world put its face on' :
      h < 12 ? 'in the plain truthful light of morning' :
      h < 17 ? 'in the wide middle of the day' :
      h < 21 ? 'in the amber hour, when the light starts telling the truth' :
      'late, when the house had gone quiet around you';
    const mins = Math.max(1, Math.round(d.playSeconds / 60));
    const date = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const first = d.shadows[0];
    const bits = [
      `Written ${timePhrase}, ${date}.`,
      `${mins} minute${mins === 1 ? '' : 's'} in the walking; ${d.collected.length} words gathered, ${d.releasedCount} given back to the sea.`,
    ];
    if (first) bits.push(`You accepted ${first} before the others — that is rarer than you know.`);
    bits.push('The ink was yours.');
    return bits.join(' ');
  },

  asText(poem) {
    const strip = s => s.replace(/\*/g, '');
    return [
      poem.title.toUpperCase(),
      strip(poem.sub),
      '',
      ...poem.lines.map(strip),
      '',
      '— ' + strip(poem.colophon),
      '',
      'PALIMPSEST',
    ].join('\n');
  },
};
