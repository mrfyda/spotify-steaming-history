/* Sample — generates a plausible synthetic history so people can try the
 * app without an export. Deterministic-ish, ~3 years, diurnal patterns. */
const Sample = (() => {

  const ARTISTS = [
    ['Arctic Monkeys', ['Do I Wanna Know?', '505', 'R U Mine?', 'Why\'d You Only Call Me When You\'re High?', 'Fluorescent Adolescent'], 'AM'],
    ['Taylor Swift', ['Cruel Summer', 'Anti-Hero', 'Blank Space', 'Style', 'August'], 'Midnights'],
    ['Kendrick Lamar', ['HUMBLE.', 'Money Trees', 'DNA.', 'Alright', 'N95'], 'DAMN.'],
    ['Daft Punk', ['Get Lucky', 'Instant Crush', 'One More Time', 'Around the World', 'Digital Love'], 'Random Access Memories'],
    ['Billie Eilish', ['bad guy', 'BIRDS OF A FEATHER', 'when the party\'s over', 'Happier Than Ever', 'ocean eyes'], 'Happier Than Ever'],
    ['The Weeknd', ['Blinding Lights', 'Starboy', 'Save Your Tears', 'The Hills', 'After Hours'], 'After Hours'],
    ['Radiohead', ['Creep', 'Karma Police', 'No Surprises', 'Weird Fishes/Arpeggi', 'Reckoner'], 'In Rainbows'],
    ['Dua Lipa', ['Levitating', 'Don\'t Start Now', 'New Rules', 'Physical', 'Houdini'], 'Future Nostalgia'],
    ['Tame Impala', ['The Less I Know the Better', 'Let It Happen', 'Borderline', 'New Person, Same Old Mistakes', 'Elephant'], 'Currents'],
    ['Frank Ocean', ['Pink + White', 'Nights', 'Thinkin Bout You', 'Ivy', 'Self Control'], 'Blonde'],
    ['Rosalía', ['DESPECHÁ', 'MALAMENTE', 'Con Altura', 'SAOKO', 'LA FAMA'], 'MOTOMAMI'],
    ['Fleetwood Mac', ['Dreams', 'The Chain', 'Everywhere', 'Go Your Own Way', 'Landslide'], 'Rumours'],
    ['SZA', ['Kill Bill', 'Snooze', 'Good Days', 'The Weekend', 'Saturn'], 'SOS'],
    ['Gorillaz', ['Feel Good Inc.', 'On Melancholy Hill', 'Clint Eastwood', 'DARE', 'Dirty Harry'], 'Demon Days'],
    ['Beyoncé', ['CUFF IT', 'TEXAS HOLD \'EM', 'Halo', 'BREAK MY SOUL', 'Crazy in Love'], 'RENAISSANCE'],
    ['Bad Bunny', ['Tití Me Preguntó', 'Me Porto Bonito', 'Callaíta', 'DÁKITI', 'Ojitos Lindos'], 'Un Verano Sin Ti'],
    ['Phoebe Bridgers', ['Motion Sickness', 'Kyoto', 'Scott Street', 'Garden Song', 'I Know the End'], 'Punisher'],
    ['Queen', ['Bohemian Rhapsody', 'Don\'t Stop Me Now', 'Another One Bites the Dust', 'Under Pressure', 'Somebody to Love'], 'A Night at the Opera'],
    ['Lana Del Rey', ['Summertime Sadness', 'Video Games', 'West Coast', 'Young and Beautiful', 'A&W'], 'Born to Die'],
    ['Foo Fighters', ['Everlong', 'The Pretender', 'Best of You', 'Learn to Fly', 'My Hero'], 'The Colour and the Shape'],
  ];
  const SHOWS = ['The Daily Drop', 'Deep Dive History', 'Tech Unplugged', 'True Crime Tapes'];
  const PLATFORMS = ['iOS', 'iOS', 'iOS', 'Android', 'Mac', 'Windows', 'Web player', 'Speakers / cast'];
  const REASONS_END = ['trackdone', 'trackdone', 'trackdone', 'fwdbtn', 'endplay', 'logout'];

  // mulberry32 — deterministic PRNG so the demo is stable
  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generate() {
    const rand = rng(20260707);
    const plays = [];
    const now = new Date();
    const start = new Date(now.getFullYear() - 2, 0, 1);
    const endTs = now.getTime() - 86400000;

    // artist popularity: heavy-tailed
    const weights = ARTISTS.map((_, i) => 1 / Math.pow(i + 1, 0.85));
    const wSum = weights.reduce((s, v) => s + v, 0);
    const pickArtist = () => {
      let r = rand() * wSum;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
      return 0;
    };

    for (let day = new Date(start); day.getTime() < endTs; day.setDate(day.getDate() + 1)) {
      if (rand() < 0.12) continue; // some silent days
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const sessions = 1 + Math.floor(rand() * (isWeekend ? 3 : 4));
      for (let s = 0; s < sessions; s++) {
        // diurnal: commute-ish, afternoon, evening peaks
        const r = rand();
        const hour = r < 0.2 ? 7 + Math.floor(rand() * 3)
          : r < 0.5 ? 13 + Math.floor(rand() * 5)
          : r < 0.9 ? 18 + Math.floor(rand() * 5)
          : (22 + Math.floor(rand() * 4)) % 24;
        let t = new Date(day); t.setHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
        const length = 2 + Math.floor(rand() * 12);
        const platform = PLATFORMS[Math.floor(rand() * PLATFORMS.length)];
        const podcastSession = rand() < 0.07;

        for (let k = 0; k < length; k++) {
          if (podcastSession) {
            const show = SHOWS[Math.floor(rand() * SHOWS.length)];
            const ms = Math.floor((15 + rand() * 40) * 60000);
            plays.push({
              ts: t.toISOString(), ms_played: ms, platform, conn_country: 'PT',
              episode_name: `${show} — Episode ${1 + Math.floor(rand() * 200)}`,
              episode_show_name: show, spotify_episode_uri: 'spotify:episode:demo',
              reason_start: 'clickrow', reason_end: 'endplay',
              shuffle: false, skipped: false, offline: false, incognito_mode: false,
            });
            t = new Date(t.getTime() + ms);
            break;
          }
          const ai = pickArtist();
          const [artist, tracks, album] = ARTISTS[ai];
          const track = tracks[Math.floor(Math.pow(rand(), 1.6) * tracks.length)];
          const skipped = rand() < 0.14;
          const ms = skipped ? Math.floor(rand() * 25000) : Math.floor((140 + rand() * 120) * 1000);
          const rs = rand();
          plays.push({
            ts: t.toISOString(), ms_played: ms, platform, conn_country: rand() < 0.94 ? 'PT' : (rand() < 0.5 ? 'ES' : 'US'),
            master_metadata_track_name: track,
            master_metadata_album_artist_name: artist,
            master_metadata_album_album_name: album,
            spotify_track_uri: 'spotify:track:demo',
            reason_start: rs < 0.55 ? 'trackdone' : rs < 0.8 ? 'clickrow' : rs < 0.9 ? 'playbtn' : rs < 0.94 ? 'backbtn' : 'appload',
            reason_end: skipped ? 'fwdbtn' : REASONS_END[Math.floor(rand() * REASONS_END.length)],
            shuffle: rand() < 0.6, skipped, offline: rand() < 0.05, incognito_mode: rand() < 0.015,
          });
          t = new Date(t.getTime() + ms + 1000);
        }
      }
    }
    return Parser.normalizeArray(plays).sort((x, y) => x.ts - y.ts);
  }

  return { generate };
})();
