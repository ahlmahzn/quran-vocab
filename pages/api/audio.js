export default async function handler(req, res) {
  const { surah, ayah, word } = req.query;

  if (!surah || !ayah || !word) {
    return res.status(400).json({ error: "Missing surah, ayah, or word" });
  }

  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  const w = String(word).padStart(3, "0");

  // Correct word-by-word audio URL from audio.quran.com
  // Format confirmed from quran.com API: wbw/001_001_001.mp3
  const url = `https://audio.quran.com/wbw/${s}_${a}_${w}.mp3`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(Buffer.from(buffer));
    }
    return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
