// config/giphy.js
const GIPHY_API_KEY = 'NzZ7wbH9Tf8XaalWDnmHLl6tL7jeUxRt';

export async function fetchGiphyClips(query = 'south africa') {
  try {
    // 👈 USING /gifs/ INSTEAD OF /clips/
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=10`
    );
    
    const data = await response.json();
    
    if (data.meta && data.meta.status !== 200) {
      console.log("Giphy API Error:", data.meta.msg);
      return [];
    }

    return data.data.map((gif) => ({
      $id: gif.id,
      // 👈 Grabbing the MP4 version of the GIF
      videoUrl: gif.images.original.mp4 || gif.images.downsized_medium.mp4, 
      caption: gif.title || 'Giphy GIF',
      userName: 'Giphy',
      likes: 0,
      thumbnailUrl: gif.images.original.url,
      avatarUrl: 'https://i.pravatar.cc/150?img=68',
      isVerified: true, // 👈 Makes the checkmark show up
    }));
  } catch (error) {
    console.error("Failed to fetch Giphy clips:", error);
    return [];
  }
}