// config/coverr.js
const COVERR_API_KEY = 'eb56178a977208ac35a8182f6c82e0d8';

export async function fetchCoverrVideos(query = 'south africa') {
  try {
    const response = await fetch(
      `https://api.coverr.co/videos?query=${encodeURIComponent(query)}&page_size=10&api_key=${COVERR_API_KEY}`
    );
    
    const data = await response.json();

    // Map the Coverr data to match your app's video structure
    return data.hits.map((video) => ({
      $id: video.id,
      // 👈 FIX: Get the MP4 from the top level of the video object
      videoUrl: video.video_1080p || video.video_720p || video.video_480p || video.video_240p,
      caption: video.title || 'Coverr Video',
      userName: 'MzansiReel', // Changed to MzansiReel so it looks official
      likes: 0,
      thumbnailUrl: video.thumbnail,
      avatarUrl: 'https://i.pravatar.cc/150?img=68',
      isVerified: true,
    }));
  } catch (error) {
    console.error("Failed to fetch Coverr videos:", error);
    return [];
  }
}