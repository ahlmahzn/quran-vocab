export default async function handler(req, res) {
  const { surah, ayah, word } = req.query;

  if (!surah || !ayah || !word) {
    return res.status(400).json({ error: "Missing surah, ayah, or word parameter" });
  }

  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  const w = String(word).padStart(3, "0");

  // Try multiple reciters in order
  const urls = [
    `https://audio.quran.com/wbw/${s}_${a}_${w}.mp3`,
    `https://audio.qurancdn.com/wbw/ar/mishari_al_afasy/${s}${a}${w}.mp3`,
    `https://audio.qurancdn.com/wbw/en/omar_hisham_al_arabi/${s}${a}${w}.mp3`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=31536000"); // cache for 1 year
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.send(Buffer.from(buffer));
      }
    } catch { continue; }
  }

  return res.status(404).json({ error: "Audio not found" });
}
