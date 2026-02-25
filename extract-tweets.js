const tweets = [];
const items = document.querySelectorAll(".timeline-item");

const maxTweets = Math.min(10, items.length);

for (let i = 0; i < maxTweets; i++) {
  const el = items[i];
  
  const textEl = el.querySelector(".tweet-content, .content, .tweet-text");
  const text = textEl?.textContent?.trim() || "";
  
  const timeEl = el.querySelector(".tweet-date a, time, .tweet-date");
  const time = timeEl?.textContent?.trim() || "";
  const timeAttr = timeEl?.getAttribute?.("datetime") || timeEl?.getAttribute?.("title") || "";
  
  const linkEl = el.querySelector("a[href*=\"status\"]");
  const link = linkEl?.href || "";
  const tweetId = link?.match(/status\/(\d+)/)?.[1] || "";
  
  const authorEl = el.querySelector(".fullname, .tweet-author-name");
  const author = authorEl?.textContent?.trim() || "";
  
  const usernameEl = el.querySelector(".username, .tweet-author-screen-name");
  const username = usernameEl?.textContent?.trim().replace("@", "") || "";
  
  const avatarEl = el.querySelector(".avatar, img[src*=\"profile_images\"]");
  const avatar = avatarEl?.src || "";
  
  const stats = el.querySelectorAll(".tweet-stat, .tweet-stats span");
  let replies = 0, retweets = 0, likes = 0, views = 0;
  
  if (stats.length >= 4) {
    replies = parseInt(stats[0]?.textContent?.replace(/,/g, "") || "0") || 0;
    retweets = parseInt(stats[1]?.textContent?.replace(/,/g, "") || "0") || 0;
    likes = parseInt(stats[2]?.textContent?.replace(/,/g, "") || "0") || 0;
    views = parseInt(stats[3]?.textContent?.replace(/,/g, "") || "0") || 0;
  } else {
    const statDivs = el.querySelectorAll(".tweet-stat div");
    statDivs.forEach((div, idx) => {
      const val = parseInt(div?.textContent?.replace(/,/g, "") || "0") || 0;
      if (idx === 0) replies = val;
      else if (idx === 1) retweets = val;
      else if (idx === 2) likes = val;
      else if (idx === 3) views = val;
    });
  }
  
  const mediaEls = el.querySelectorAll(".attachments img, .tweet-media img");
  const media = Array.from(mediaEls).map(img => img.src).filter(Boolean);
  
  const isRetweet = el.classList.contains("retweet") || el.querySelector(".retweet-icon") !== null;
  const isReply = el.querySelector(".reply-icon, .replying-to") !== null;
  
  if (text || link) {
    tweets.push({
      id: tweetId,
      author,
      username,
      avatar,
      text: text.substring(0, 1000),
      time,
      time_attr: timeAttr,
      link: link.replace("#m", ""),
      is_retweet: isRetweet,
      is_reply: isReply,
      stats: { replies, retweets, likes, views },
      media_count: media.length,
      media: media.slice(0, 4)
    });
  }
}

JSON.stringify({
  user: window.location.pathname.replace("/", ""),
  scraped_at: new Date().toISOString(),
  url: window.location.href,
  tweets_count: tweets.length,
  tweets
}, null, 2);
