import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { formatCompactCount } from '../config/formatNumbers';
import { ensureUserDoc, getUserDoc, getUserDocs, getVideoThumbnail, requireAuth } from '../config/helpers';
import {
  listActiveStories,
  listCreatorPage,
  listExplorePosts,
  listExploreVideos,
  listFollowPage,
  searchPosts,
  searchVideos,
  SEARCH_PAGE_SIZE,
} from '../config/searchService';
import Avatar from '../components/Avatar';
import StoriesRow, { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import TextPostCard from '../components/TextPostCard';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSearchMenu } from '../context/SearchMenuContext';

const TABS = ['Search', 'Creators', 'Explore'];
const SEARCH_HISTORY_KEY = '@mzansireels/search-history';
const SEARCH_HISTORY_LIMIT = 8;
const TREND_SAMPLE_SIZE = 100;

function uniqueCreators(creators) {
  const byUserId = new Map();
  (creators || []).forEach((creator) => {
    if (!creator?.userId || creator.isPrivate === true) return;
    const existing = byUserId.get(creator.userId);
    if (!existing || (creator.isVerified === true && existing.isVerified !== true)) {
      byUserId.set(creator.userId, creator);
    }
  });
  return [...byUserId.values()].sort((a, b) => (
    Number(b.isVerified === true) - Number(a.isVerified === true)
      || (Number(b.followers) || 0) - (Number(a.followers) || 0)
  ));
}

function mergeDocuments(current, incoming, uniqueBy = '$id') {
  const byId = new Map((current || []).map((item) => [item[uniqueBy], item]));
  (incoming || []).forEach((item) => byId.set(item[uniqueBy], item));
  return [...byId.values()];
}

async function filterPublicContent(items, currentUserId) {
  const visibleItems = (items || []).filter((item) => (
    item.isPrivate !== true || item.userId === currentUserId
  ));
  const authorIds = [...new Set(visibleItems
    .map((item) => item.userId)
    .filter((userId) => userId && userId !== currentUserId))];
  if (!authorIds.length) {
    return visibleItems.filter((item) => item.userId === currentUserId);
  }

  try {
    const profiles = await getUserDocs(authorIds);
    const publicAuthors = new Set(
      profiles.filter((profile) => profile.isPrivate !== true).map((profile) => profile.userId),
    );
    return visibleItems.filter((item) => (
      item.userId === currentUserId || publicAuthors.has(item.userId)
    ));
  } catch (error) {
    console.warn('Could not verify discovery content privacy:', error);
    return visibleItems.filter((item) => item.userId === currentUserId);
  }
}

function getHashtags(videos) {
  const tagCounts = new Map();
  (videos || []).forEach((video) => {
    const field = Array.isArray(video.hashtags) ? video.hashtags.join(' ') : String(video.hashtags || '');
    const fieldTags = field.match(/[A-Za-z0-9_]+/g) || [];
    const captionTags = `${video.caption || ''} ${video.content || ''}`.match(/#[A-Za-z0-9_]+/g) || [];
    const tags = new Set([
      ...fieldTags.map((tag) => `#${tag.replace(/^#+/, '').toLowerCase()}`),
      ...captionTags.map((tag) => tag.toLowerCase()),
    ]);
    tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
  });
  return [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

function getSounds(videos) {
  const soundCounts = new Map();
  (videos || []).forEach((video) => {
    const sound = String(video.soundName || '').trim();
    if (sound && sound.toLowerCase() !== 'original audio') {
      soundCounts.set(sound, (soundCounts.get(sound) || 0) + 1);
    }
  });
  return [...soundCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sound, count]) => ({ sound, count }));
}

function VideoTile({ video, onPress }) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumbnail = useMemo(() => {
    try {
      return video.thumbnailUrl || getVideoThumbnail(video);
    } catch {
      return '';
    }
  }, [video]);

  useEffect(() => setImageFailed(false), [video.$id, thumbnail]);

  return (
    <TouchableOpacity style={styles.videoTile} activeOpacity={0.85} onPress={onPress}>
      {thumbnail && !imageFailed ? (
        <Image source={{ uri: thumbnail }} style={styles.videoThumbnail} onError={() => setImageFailed(true)} />
      ) : (
        <View style={styles.videoPlaceholder}>
          <Ionicons name="play" size={24} color="#AAB2BD" />
        </View>
      )}
      <View style={styles.videoMeta}>
        <Ionicons name="play" size={12} color="#fff" />
        <Text style={styles.videoMetaText}>{formatCompactCount(video.views || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function VideoGrid({ videos, onPress }) {
  const rows = [];
  for (let index = 0; index < videos.length; index += 3) {
    rows.push(videos.slice(index, index + 3));
  }
  return (
    <View>
      {rows.map((row, rowIndex) => (
        <View key={`video-row-${rowIndex}`} style={styles.videoRow}>
          {row.map((video) => (
            <VideoTile key={video.$id} video={video} onPress={() => onPress(video)} />
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }, (_, index) => (
            <View key={`spacer-${rowIndex}-${index}`} style={styles.videoSpacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

function CreatorCard({
  creator,
  followed,
  busy,
  disabled,
  colors,
  onOpen,
  onFollow,
}) {
  return (
    <View style={[styles.creatorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.creatorProfile} onPress={onOpen} activeOpacity={0.8}>
        <Avatar
          uri={creator.avatarUrl}
          userId={creator.userId}
          name={creator.username || creator.name}
          size={50}
          bordered={creator.isVerified === true}
        />
        <View style={styles.creatorDetails}>
          <View style={styles.creatorNameRow}>
            <Text style={[styles.creatorName, { color: colors.text }]} numberOfLines={1}>
              {creator.name || creator.username || 'Creator'}
            </Text>
            {creator.isVerified === true && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} style={styles.verifiedIcon} />
            )}
          </View>
          <Text style={[styles.creatorHandle, { color: colors.muted }]} numberOfLines={1}>
            @{creator.username || creator.userId}
          </Text>
          {creator.bio ? (
            <Text style={[styles.creatorBio, { color: colors.muted }]} numberOfLines={1}>
              {creator.bio}
            </Text>
          ) : null}
          <Text style={[styles.creatorCounts, { color: colors.muted }]}>
            {formatCompactCount(creator.followers)} followers · {formatCompactCount(creator.following)} following
          </Text>
        </View>
      </TouchableOpacity>
      {creator.userId !== creator.currentUserId && (
        <TouchableOpacity
          style={[
            styles.followButton,
            { borderColor: followed ? colors.border : COLORS.cyan, backgroundColor: followed ? colors.card : COLORS.cyan },
            disabled && styles.disabledButton,
          ]}
          onPress={onFollow}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel={followed ? `Unfollow ${creator.username || creator.name}` : `Follow ${creator.username || creator.name}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={followed ? colors.text : '#000'} />
          ) : (
            <Text style={[styles.followButtonText, { color: creator.userId === creator.currentUserId || followed ? colors.text : '#000' }]}>
              {creator.userId === creator.currentUserId ? 'You' : followed ? 'Following' : 'Follow'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function SectionTitle({ title, colors, action, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function SearchScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { searchTab, setSearchTab } = useSearchMenu();
  const [searchText, setSearchText] = useState('');
  const [videos, setVideos] = useState([]);
  const [creators, setCreators] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [suggestionVideos, setSuggestionVideos] = useState([]);
  const [suggestionPosts, setSuggestionPosts] = useState([]);
  const [suggestionCreators, setSuggestionCreators] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionRetry, setSuggestionRetry] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const [historyReady, setHistoryReady] = useState(false);
  const recentSearchRef = useRef([]);
  const offsets = useRef({ videos: 0, creators: 0, posts: 0 });
  const [hasMore, setHasMore] = useState({ videos: false, creators: false, posts: false });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const pendingRequest = useRef(false);
  const [followRecords, setFollowRecords] = useState({});
  const [followBusy, setFollowBusy] = useState({});
  const followBusyRef = useRef(new Set());
  const [followsLoading, setFollowsLoading] = useState(false);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState(0);
  const activeTab = TABS.includes(searchTab) ? searchTab : 'Search';
  const normalizedSearch = searchText.trim().toLowerCase();
  const storyGroups = useMemo(
    () => groupStories(stories.filter((story) => story.userId !== user?.$id), user?.$id),
    [stories, user?.$id],
  );
  const tags = useMemo(
    () => getHashtags([...suggestionVideos, ...suggestionPosts]),
    [suggestionPosts, suggestionVideos],
  );
  const sounds = useMemo(() => getSounds(suggestionVideos), [suggestionVideos]);
  const categories = useMemo(
    () => [...new Set(suggestionVideos.map((video) => String(video.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [suggestionVideos],
  );
  const popularVideos = useMemo(
    () => [...suggestionVideos]
      .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
      .slice(0, 6),
    [suggestionVideos],
  );
  const dedupedCreators = useMemo(() => uniqueCreators(creators), [creators]);
  const featuredCreators = useMemo(
    () => dedupedCreators.filter((creator) => creator.isVerified === true && creator.userId !== user?.$id),
    [dedupedCreators, user?.$id],
  );
  const recommendedCreators = useMemo(
    () => dedupedCreators.filter((creator) => creator.isVerified !== true && creator.userId !== user?.$id),
    [dedupedCreators, user?.$id],
  );
  const discoveryCreators = useMemo(
    () => uniqueCreators(suggestionCreators).filter((creator) => creator.userId !== user?.$id).slice(0, 8),
    [suggestionCreators, user?.$id],
  );
  const discoveryFeatured = useMemo(
    () => discoveryCreators.filter((creator) => creator.isVerified === true),
    [discoveryCreators],
  );
  const discoveryRecommended = useMemo(
    () => discoveryCreators.filter((creator) => creator.isVerified !== true),
    [discoveryCreators],
  );

  useEffect(() => {
    const requestedTab = route?.params?.initialTab;
    if (TABS.includes(requestedTab)) setSearchTab(requestedTab);
  }, [route?.params?.initialTab, setSearchTab]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SEARCH_HISTORY_KEY)
      .then((value) => {
        const stored = JSON.parse(value || '[]');
        if (active && Array.isArray(stored)) {
          const history = stored.filter((item) => typeof item === 'string').slice(0, SEARCH_HISTORY_LIMIT);
          recentSearchRef.current = history;
          setRecentSearches(history);
        }
      })
      .catch((storageError) => console.warn('Could not load recent searches:', storageError))
      .finally(() => {
        if (active) setHistoryReady(true);
      });
    return () => { active = false; };
  }, []);

  const recordRecentSearch = useCallback(async (value) => {
    const term = String(value || '').trim();
    if (!term) return;
    const next = [term, ...recentSearchRef.current.filter((entry) => entry.toLowerCase() !== term.toLowerCase())]
      .slice(0, SEARCH_HISTORY_LIMIT);
    recentSearchRef.current = next;
    setRecentSearches(next);
    try {
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch (storageError) {
      console.warn('Could not save recent search:', storageError);
    }
  }, []);

  useEffect(() => {
    if (!historyReady || activeTab !== 'Search' || !searchText.trim()) return undefined;
    const timeout = setTimeout(() => recordRecentSearch(searchText), 800);
    return () => clearTimeout(timeout);
  }, [activeTab, historyReady, recordRecentSearch, searchText]);

  const clearRecentSearches = async () => {
    recentSearchRef.current = [];
    setRecentSearches([]);
    try {
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (storageError) {
      console.warn('Could not clear recent searches:', storageError);
    }
  };

  useEffect(() => {
    let active = true;
    setSuggestionsLoading(true);
    setSuggestionError('');
    Promise.all([
      listExploreVideos(0, TREND_SAMPLE_SIZE).then((result) => ({ result })).catch((error) => ({ error })),
      listExplorePosts(0, TREND_SAMPLE_SIZE).then((result) => ({ result })).catch((error) => ({ error })),
      listCreatorPage(0, TREND_SAMPLE_SIZE).then((result) => ({ result })).catch((error) => ({ error })),
    ]).then(async ([videoPage, postPage, creatorPage]) => {
      if (!active) return;
      const [publicVideos, publicPosts] = await Promise.all([
        videoPage.result
          ? filterPublicContent(videoPage.result.documents, user?.$id)
          : Promise.resolve([]),
        postPage.result
          ? filterPublicContent(postPage.result.documents, user?.$id)
          : Promise.resolve([]),
      ]);
      if (active) {
        setSuggestionVideos(publicVideos);
        setSuggestionPosts(publicPosts);
      }
      if (creatorPage.result) setSuggestionCreators(uniqueCreators(creatorPage.result.documents || []));
      if (videoPage.error || postPage.error || creatorPage.error) {
        setSuggestionError('Some suggestions could not be loaded from Appwrite.');
      }
    }).finally(() => {
      if (active) setSuggestionsLoading(false);
    });
    return () => { active = false; };
  }, [suggestionRetry, user?.$id]);

  useEffect(() => {
    if (!user?.$id) {
      setFollowRecords({});
      setFollowsLoading(false);
      return undefined;
    }
    setFollowRecords({});
    let active = true;
    const loadFollowRecords = async () => {
      setFollowsLoading(true);
      try {
        const records = {};
        let offset = 0;
        let total = 0;
        do {
          const page = await listFollowPage(user.$id, offset, 100);
          page.documents.forEach((record) => {
            if (record.followingId) records[record.followingId] = record.$id;
          });
          if (!page.documents.length) break;
          offset += page.documents.length;
          total = page.total;
        } while (offset < total);
        if (active) setFollowRecords(records);
      } catch (followError) {
        console.warn('Could not load followed creators:', followError);
      } finally {
        if (active) setFollowsLoading(false);
      }
    };
    loadFollowRecords();
    return () => { active = false; };
  }, [user?.$id]);

  const fetchPage = useCallback(async (reset = false, token = requestId.current) => {
    if (!reset && pendingRequest.current) return;
    pendingRequest.current = true;
    const pageOffsets = reset ? { videos: 0, creators: 0, posts: 0 } : { ...offsets.current };
    if (reset) {
      offsets.current = pageOffsets;
      setVideos([]);
      setCreators([]);
      setPosts([]);
      setStories([]);
      setHasMore({ videos: false, creators: false, posts: false });
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');
    setNotice('');

    try {
      if (activeTab === 'Search') {
        const [videoOutcome, postOutcome, creatorOutcome] = await Promise.all([
          searchVideos(searchText, pageOffsets.videos, SEARCH_PAGE_SIZE)
            .then((result) => ({ result }))
            .catch((searchError) => ({ searchError })),
          searchPosts(searchText, pageOffsets.posts, SEARCH_PAGE_SIZE)
            .then((result) => ({ result }))
            .catch((postError) => ({ postError })),
          listCreatorPage(pageOffsets.creators, SEARCH_PAGE_SIZE)
            .then((result) => ({ result }))
            .catch((creatorError) => ({ creatorError })),
        ]);
        if (token !== requestId.current) return;
        if (!videoOutcome.result && !creatorOutcome.result && !postOutcome.result) {
          throw videoOutcome.searchError || creatorOutcome.creatorError || postOutcome.postError;
        }

        const videoPage = videoOutcome.result;
        const creatorPage = creatorOutcome.result;
        const postPage = postOutcome.result;
        const content = await filterPublicContent([
          ...(videoPage?.documents || []),
          ...(postPage?.documents || []),
        ], user?.$id);
        if (token !== requestId.current) return;
        const visibleContentIds = new Set(content.map((item) => item.$id));
        if (videoPage) {
          setVideos((current) => mergeDocuments(
            current,
            (videoPage.documents || []).filter((video) => visibleContentIds.has(video.$id)),
          ));
          pageOffsets.videos += (videoPage.documents || []).length;
        }
        if (postPage) {
          setPosts((current) => mergeDocuments(
            current,
            (postPage.documents || []).filter((post) => visibleContentIds.has(post.$id)),
          ));
          pageOffsets.posts += (postPage.documents || []).length;
        }
        if (creatorPage) {
          const matchingCreators = (creatorPage.documents || []).filter((creator) => (
            creator.userId
            && creator.isPrivate !== true
            && [creator.username, creator.name]
              .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
          ));
          setCreators((current) => uniqueCreators([...current, ...matchingCreators]));
          pageOffsets.creators += (creatorPage.documents || []).length;
        }
        offsets.current = pageOffsets;
        setHasMore({
          videos: videoPage ? pageOffsets.videos < videoPage.total : false,
          creators: creatorPage ? pageOffsets.creators < creatorPage.total : false,
          posts: postPage ? pageOffsets.posts < postPage.total : false,
        });
        if (videoOutcome.searchError || videoPage?.fieldSearchLimited) {
          setNotice('Video search could not check every field. Hashtag and sound-name matches require matching Appwrite full-text indexes.');
        } else if (postPage?.fieldSearchLimited) {
          setNotice('Post search is using partial matching because the Appwrite full-text index is unavailable.');
        } else if (creatorOutcome.creatorError) {
          setNotice('Creator search is temporarily unavailable.');
        } else if (postOutcome.postError) {
          setNotice('Post search is temporarily unavailable.');
        }
      } else if (activeTab === 'Creators') {
        const result = await listCreatorPage(pageOffsets.creators, SEARCH_PAGE_SIZE);
        if (token !== requestId.current) return;
        const matchingCreators = (result.documents || []).filter((creator) => (
          creator.userId
          && creator.isPrivate !== true
          && (!normalizedSearch || [creator.username, creator.name]
            .some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
        ));
        setCreators((current) => uniqueCreators([...current, ...matchingCreators]));
        pageOffsets.creators += (result.documents || []).length;
        offsets.current = pageOffsets;
        setHasMore({
          videos: false,
          creators: pageOffsets.creators < result.total,
          posts: false,
        });
      } else {
        const [videoOutcome, postOutcome, storyOutcome] = await Promise.all([
          listExploreVideos(pageOffsets.videos, SEARCH_PAGE_SIZE)
            .then((result) => ({ result }))
            .catch((videoError) => ({ videoError })),
          listExplorePosts(pageOffsets.posts, SEARCH_PAGE_SIZE)
            .then((result) => ({ result }))
            .catch((postError) => ({ postError })),
          reset
            ? listActiveStories().then((result) => ({ stories: result })).catch((storyError) => ({ storyError }))
            : Promise.resolve({ stories: null }),
        ]);
        if (token !== requestId.current) return;
        if (!videoOutcome.result && !postOutcome.result && storyOutcome.storyError) {
          throw videoOutcome.videoError || postOutcome.postError || storyOutcome.storyError;
        }
        const videoPage = videoOutcome.result;
        const postPage = postOutcome.result;
        const content = await filterPublicContent([
          ...(videoPage?.documents || []),
          ...(postPage?.documents || []),
        ], user?.$id);
        if (token !== requestId.current) return;
        const visibleContentIds = new Set(content.map((item) => item.$id));
        if (videoPage) {
          setVideos((current) => mergeDocuments(
            current,
            (videoPage.documents || []).filter((video) => visibleContentIds.has(video.$id)),
          ));
          pageOffsets.videos += (videoPage.documents || []).length;
        }
        if (postPage) {
          setPosts((current) => mergeDocuments(
            current,
            (postPage.documents || []).filter((post) => visibleContentIds.has(post.$id)),
          ));
          pageOffsets.posts += (postPage.documents || []).length;
        }
        if (storyOutcome.stories) setStories(storyOutcome.stories);
        offsets.current = pageOffsets;
        setHasMore({
          videos: videoPage ? pageOffsets.videos < videoPage.total : false,
          creators: false,
          posts: postPage ? pageOffsets.posts < postPage.total : false,
        });
        if (videoOutcome.videoError || postOutcome.postError || storyOutcome.storyError) {
          setNotice('Some discovery content could not be loaded. Available Appwrite content is still shown.');
        }
      }
    } catch (fetchError) {
      console.error(`Could not load ${activeTab.toLowerCase()} results:`, fetchError);
      if (token === requestId.current) {
        setError(`Could not load ${activeTab.toLowerCase()}. Check your connection and try again.`);
      }
    } finally {
      if (token === requestId.current) {
        pendingRequest.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeTab, normalizedSearch, searchText, user?.$id]);

  useEffect(() => {
    const token = ++requestId.current;
    pendingRequest.current = false;
    offsets.current = { videos: 0, creators: 0, posts: 0 };
    setVideos([]);
    setCreators([]);
    setPosts([]);
    setStories([]);
    setHasMore({ videos: false, creators: false, posts: false });
    setError('');
    setNotice('');

    if (activeTab === 'Search' && !normalizedSearch) {
      setLoading(false);
      setLoadingMore(false);
      return undefined;
    }

    setLoading(true);
    const timeout = setTimeout(() => fetchPage(true, token), 250);
    return () => clearTimeout(timeout);
  }, [activeTab, normalizedSearch, retry, fetchPage]);

  const loadMore = () => {
    const canLoadMore = activeTab === 'Search'
      ? hasMore.videos || hasMore.creators || hasMore.posts
      : activeTab === 'Creators'
        ? hasMore.creators
        : hasMore.videos || hasMore.posts;
    if (!loading && !loadingMore && canLoadMore) fetchPage(false, requestId.current);
  };

  const openVideo = (video) => navigation.navigate('Watch', { video, allVideos: videos });
  const openCreator = (creator) => navigation.navigate('UserProfile', {
    userId: creator.userId,
    userName: creator.username || creator.name || 'creator',
  });
  const adjustFollowCounts = async (targetUserId, delta) => {
    let updatedFollowerCount = null;
    try {
      const [targetProfile, currentProfile] = await Promise.all([
        getUserDoc(targetUserId).catch(() => null),
        ensureUserDoc(user),
      ]);
      if (targetProfile) {
        const updatedProfile = await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, targetProfile.$id, {
          followers: Math.max(0, (Number(targetProfile.followers) || 0) + delta),
        });
        const count = Number(updatedProfile.followers);
        updatedFollowerCount = Number.isFinite(count) ? count : null;
      }
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, currentProfile.$id, {
        following: Math.max(0, (Number(currentProfile.following) || 0) + delta),
      });
    } catch (countError) {
      console.warn('Follow relationship saved, but profile counts could not be updated:', countError);
    }
    return updatedFollowerCount;
  };

  const setCreatorFollowerCount = (userId, count) => {
    const update = (current) => current.map((creator) => (
      creator.userId === userId ? { ...creator, followers: count } : creator
    ));
    setCreators(update);
    setSuggestionCreators(update);
  };

  const toggleFollow = async (creator) => {
    const creatorId = creator.userId;
    if (!creatorId || creatorId === user?.$id || followBusyRef.current.has(creatorId)) return;
    if (!requireAuth('follow this creator', navigation, user)) return;

    followBusyRef.current.add(creatorId);
    setFollowBusy((current) => ({ ...current, [creatorId]: true }));
    try {
      const existingId = followRecords[creatorId];
      if (existingId) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.follows, existingId);
        setFollowRecords((current) => {
          const next = { ...current };
          delete next[creatorId];
          return next;
        });
        const followerCount = await adjustFollowCounts(creatorId, -1);
        if (followerCount !== null) setCreatorFollowerCount(creatorId, followerCount);
      } else {
        const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id),
          Query.equal('followingId', creatorId),
          Query.limit(1),
        ]);
        if (existing.documents[0]) {
          setFollowRecords((current) => ({ ...current, [creatorId]: existing.documents[0].$id }));
          return;
        }
        const record = await databases.createDocument(DATABASE_ID, COLLECTIONS.follows, ID.unique(), {
          followerId: user.$id,
          followingId: creatorId,
        });
        setFollowRecords((current) => ({ ...current, [creatorId]: record.$id }));
        const followerCount = await adjustFollowCounts(creatorId, 1);
        if (followerCount !== null) setCreatorFollowerCount(creatorId, followerCount);
      }
    } catch (followError) {
      console.error('Could not update creator follow status:', followError);
      setNotice('Could not update follow status. Check your connection and permissions, then try again.');
    } finally {
      followBusyRef.current.delete(creatorId);
      setFollowBusy((current) => ({ ...current, [creatorId]: false }));
    }
  };

  const creatorCard = (creator) => (
    <CreatorCard
      key={creator.userId}
      creator={{ ...creator, currentUserId: user?.$id }}
      followed={Boolean(followRecords[creator.userId])}
      busy={Boolean(followBusy[creator.userId])}
      disabled={creator.userId === user?.$id || followsLoading}
      colors={colors}
      onOpen={() => openCreator(creator)}
      onFollow={() => toggleFollow(creator)}
    />
  );

  const useSearchSuggestion = (value) => {
    setSearchText(value);
    setSearchTab('Search');
  };

  const activeHasMore = activeTab === 'Search'
    ? hasMore.videos || hasMore.creators || hasMore.posts
    : activeTab === 'Creators'
      ? hasMore.creators
      : hasMore.videos || hasMore.posts;

  const renderLoadingMore = () => (
    <View style={styles.listFooter}>
      {loadingMore ? (
        <ActivityIndicator size="small" color={COLORS.cyan} />
      ) : activeHasMore ? (
        <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore}>
          <Text style={styles.loadMoreText}>Load more</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const emptyResults = (message) => (
    <View style={styles.emptyState}>
      <Text style={[styles.stateText, { color: colors.muted }]}>{message}</Text>
    </View>
  );

  const renderSearchDiscovery = () => (
    <View style={styles.pageContent}>
      {suggestionError ? (
        <View style={styles.suggestionError}>
          <Text style={[styles.helperText, { color: colors.muted }]}>{suggestionError}</Text>
          <TouchableOpacity onPress={() => setSuggestionRetry((value) => value + 1)}>
            <Text style={styles.sectionAction}>Retry suggestions</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.section}>
        <SectionTitle
          title="Recent searches"
          colors={colors}
          action={recentSearches.length ? 'Clear' : null}
          onAction={clearRecentSearches}
        />
        {recentSearches.length ? (
          <View style={styles.chipWrap}>
            {recentSearches.map((term) => (
              <TouchableOpacity key={term} style={styles.historyChip} onPress={() => useSearchSuggestion(term)}>
                <Ionicons name="time-outline" size={15} color={colors.muted} />
                <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>{term}</Text>
                <Ionicons name="arrow-up-outline" size={14} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.muted }]}>Your recent searches will appear here.</Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Trending hashtags" colors={colors} />
        {tags.length ? (
          <View style={styles.chipWrap}>
            {tags.slice(0, 12).map(({ tag, count }) => (
              <TouchableOpacity key={tag} style={styles.trendChip} onPress={() => useSearchSuggestion(tag)}>
                <Text style={styles.trendText}>{tag}</Text>
                <Text style={styles.trendCount}>{formatCompactCount(count)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.muted }]}>
            {suggestionError || (suggestionsLoading ? 'Checking recent videos and posts for hashtags…' : 'No hashtags found in recent content.')}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Sounds in recent videos" colors={colors} />
        {sounds.length ? (
          <View style={styles.chipWrap}>
            {sounds.slice(0, 8).map(({ sound, count }) => (
              <TouchableOpacity key={sound} style={styles.soundChip} onPress={() => useSearchSuggestion(sound)}>
                <Ionicons name="musical-notes-outline" size={15} color={COLORS.cyan} />
                <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>{sound}</Text>
                <Text style={styles.trendCount}>{formatCompactCount(count)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.muted }]}>
            {suggestionError || (suggestionsLoading ? 'Checking recent videos for sound names…' : 'No sound names found in recent video data.')}
          </Text>
        )}
        <Text style={[styles.indexNote, { color: colors.muted }]}>
          Sound and hashtag search uses existing video fields when those fields have Appwrite full-text indexes.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Creators to explore" colors={colors} />
        {discoveryCreators.length ? (
          <View>
            {discoveryFeatured.length ? (
              <>
                <Text style={[styles.subsectionTitle, { color: colors.muted }]}>Verified</Text>
                {discoveryFeatured.slice(0, 4).map(creatorCard)}
              </>
            ) : null}
            {discoveryRecommended.length ? (
              <>
                <Text style={[styles.subsectionTitle, { color: colors.muted }]}>More creators</Text>
                {discoveryRecommended.slice(0, 4).map(creatorCard)}
              </>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.muted }]}>
            {suggestionError || (suggestionsLoading ? 'Loading creator recommendations…' : 'No public creator profiles are available yet.')}
          </Text>
        )}
      </View>
    </View>
  );

  const renderSearchResults = () => (
    <View style={styles.pageContent}>
      <Text style={[styles.resultSummary, { color: colors.muted }]}>Results for “{searchText.trim()}”</Text>
      {creators.length ? (
        <View style={styles.section}>
          <SectionTitle title="People" colors={colors} action="See all" onAction={() => setSearchTab('Creators')} />
          {uniqueCreators(creators).slice(0, 6).map(creatorCard)}
        </View>
      ) : null}
      {videos.length ? (
        <View style={styles.section}>
          <SectionTitle title="Videos" colors={colors} />
          <VideoGrid videos={videos} onPress={openVideo} />
        </View>
      ) : null}
      {posts.length ? (
        <View style={styles.section}>
          <SectionTitle title="Posts" colors={colors} />
          {posts.map((post) => (
            <TextPostCard key={post.$id} post={post} user={user} navigation={navigation} />
          ))}
        </View>
      ) : null}
      {!creators.length && !videos.length && !posts.length
        ? emptyResults(activeHasMore ? 'No matches on this page yet.' : `No results found for "${searchText.trim()}".`)
        : null}
      {renderLoadingMore()}
    </View>
  );

  const renderCreators = () => (
    <View style={styles.pageContent}>
      {featuredCreators.length ? (
        <View style={styles.section}>
          <SectionTitle title="Featured verified creators" colors={colors} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
            {featuredCreators.map((creator) => (
              <TouchableOpacity
                key={creator.userId}
                style={[styles.featuredCreator, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openCreator(creator)}
              >
                <View style={styles.featuredAvatar}>
                  <Avatar uri={creator.avatarUrl} userId={creator.userId} name={creator.username || creator.name} size={62} bordered />
                  {creator.isVerified === true && (
                    <Ionicons name="checkmark-circle" size={19} color={COLORS.cyan} style={styles.featuredVerified} />
                  )}
                </View>
                <Text style={[styles.featuredName, { color: colors.text }]} numberOfLines={1}>
                  @{creator.username || creator.userId}
                </Text>
                <Text style={[styles.featuredFollowers, { color: colors.muted }]}>
                  {formatCompactCount(creator.followers)} followers
                </Text>
                <TouchableOpacity
                  style={[
                    styles.featuredFollowButton,
                    { backgroundColor: followRecords[creator.userId] ? colors.bg : COLORS.cyan },
                  ]}
                  onPress={() => toggleFollow(creator)}
                  disabled={creator.userId === user?.$id || followsLoading || followBusy[creator.userId]}
                >
                  {followBusy[creator.userId] ? (
                    <ActivityIndicator size="small" color={followRecords[creator.userId] ? colors.text : '#000'} />
                  ) : (
                    <Text style={[styles.featuredFollowText, { color: creator.userId === user?.$id || followRecords[creator.userId] ? colors.text : '#000' }]}>
                      {creator.userId === user?.$id ? 'You' : followRecords[creator.userId] ? 'Following' : 'Follow'}
                    </Text>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle
          title={normalizedSearch ? 'Matching creators' : 'Creators to explore'}
          colors={colors}
        />
        {recommendedCreators.map(creatorCard)}
        {!featuredCreators.length && !recommendedCreators.length
          ? emptyResults(hasMore.creators ? 'No matching creators on this page.' : 'No public creators found.')
          : null}
        {renderLoadingMore()}
      </View>
    </View>
  );

  const handleOpenStory = (index) => {
    setActiveStoryGroup(index);
    setStoryViewerVisible(true);
  };

  const renderExplore = () => (
    <View style={styles.pageContent}>
      {storyGroups.length ? (
        <View style={styles.section}>
          <SectionTitle title="Stories" colors={colors} />
          <StoriesRow stories={stories} user={user} onOpenStory={handleOpenStory} />
        </View>
      ) : null}
      {videos.length ? (
        <View style={styles.section}>
          <SectionTitle title="Latest videos" colors={colors} />
          <VideoGrid videos={videos} onPress={openVideo} />
        </View>
      ) : null}
      {popularVideos.length ? (
        <View style={styles.section}>
          <SectionTitle title="Popular videos" colors={colors} />
          <VideoGrid videos={popularVideos} onPress={openVideo} />
        </View>
      ) : null}
      {categories.length ? (
        <View style={styles.section}>
          <SectionTitle title="Explore categories" colors={colors} />
          <View style={styles.chipWrap}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={styles.trendChip}
                onPress={() => {
                  setSearchTab('Search');
                  setSearchText(category);
                }}
              >
                <Text style={styles.trendText}>{category}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {discoveryCreators.length ? (
        <View style={styles.section}>
          <SectionTitle title="Trending creators" colors={colors} />
          {discoveryCreators.slice(0, 5).map(creatorCard)}
        </View>
      ) : null}
      {posts.length ? (
        <View style={styles.section}>
          <SectionTitle title="Community posts" colors={colors} />
          {posts.map((post) => (
            <TextPostCard key={post.$id} post={post} user={user} navigation={navigation} />
          ))}
        </View>
      ) : null}
      {!videos.length && !posts.length && !storyGroups.length
        ? emptyResults('No public videos, posts, or active stories to explore yet.')
        : null}
      {renderLoadingMore()}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Discover</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Find creators and videos from Mzansi</Text>
          </View>
          <Ionicons name="sparkles-outline" size={25} color={COLORS.cyan} />
        </View>
        {activeTab !== 'Explore' && (
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={20} color={colors.muted} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={activeTab === 'Creators' ? 'Search creators' : 'Search videos, people, posts, sounds, hashtags'}
              placeholderTextColor={colors.muted}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => recordRecentSearch(searchText)}
            />
            {!!searchText && (
              <TouchableOpacity onPress={() => setSearchText('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={20} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {TABS.map((tab) => {
            const selected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={styles.tab}
                onPress={() => setSearchTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.tabText, { color: selected ? COLORS.cyan : colors.muted }]}>{tab}</Text>
                {selected && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading && !videos.length && !creators.length && !posts.length ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loading} />
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, { color: colors.muted }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setRetry((value) => value + 1)}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          key={activeTab}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
          {activeTab === 'Search'
            ? normalizedSearch ? renderSearchResults() : renderSearchDiscovery()
            : activeTab === 'Creators' ? renderCreators() : renderExplore()}
        </ScrollView>
      )}

      <StoryViewer
        visible={storyViewerVisible}
        storyGroups={storyGroups}
        initialGroupIndex={activeStoryGroup}
        userId={user?.$id}
        currentUser={user}
        onClose={() => setStoryViewerVisible(false)}
        onViewRecorded={(updatedStory) => {
          setStories((current) => current.map((story) => (
            story.$id === updatedStory.$id ? updatedStory : story
          )));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16 },
  tabRow: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, position: 'relative' },
  tabText: { fontSize: 15, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: -1, width: '62%', height: 3, borderRadius: 2, backgroundColor: COLORS.cyan },
  loading: { marginTop: 50 },
  scrollContent: { paddingBottom: 24 },
  pageContent: { paddingHorizontal: 15, paddingTop: 14 },
  section: { marginBottom: 24 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionAction: { color: COLORS.cyan, fontWeight: '700', fontSize: 13 },
  subsectionTitle: { fontSize: 12, fontWeight: '800', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  helperText: { fontSize: 13, lineHeight: 19 },
  indexNote: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, gap: 6 },
  historyText: { maxWidth: 200, fontSize: 13, fontWeight: '600' },
  trendChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 7 },
  trendText: { color: COLORS.cyan, fontSize: 13, fontWeight: '700' },
  trendCount: { color: COLORS.muted, fontSize: 11 },
  soundChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, gap: 7 },
  resultSummary: { fontSize: 13, marginBottom: 14 },
  creatorCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 9 },
  creatorProfile: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  creatorDetails: { flex: 1, minWidth: 0, marginLeft: 11, marginRight: 7 },
  creatorNameRow: { flexDirection: 'row', alignItems: 'center' },
  creatorName: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  verifiedIcon: { marginLeft: 5 },
  creatorHandle: { fontSize: 12, marginTop: 2 },
  creatorBio: { fontSize: 11, marginTop: 4 },
  creatorCounts: { fontSize: 11, marginTop: 4 },
  followButton: { minWidth: 84, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 10 },
  followButtonText: { fontSize: 12, fontWeight: '800' },
  disabledButton: { opacity: 0.5 },
  featuredRow: { paddingRight: 10, gap: 10 },
  featuredCreator: { width: 136, alignItems: 'center', borderWidth: 1, borderRadius: 15, padding: 11 },
  featuredAvatar: { position: 'relative', marginBottom: 7 },
  featuredVerified: { position: 'absolute', right: -2, bottom: 0, backgroundColor: COLORS.bg, borderRadius: 10 },
  featuredName: { maxWidth: '100%', fontSize: 12, fontWeight: '700' },
  featuredFollowers: { fontSize: 10, marginTop: 3 },
  featuredFollowButton: { minWidth: 88, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginTop: 9, paddingHorizontal: 12 },
  featuredFollowText: { fontSize: 11, fontWeight: '800' },
  videoRow: { flexDirection: 'row', width: '100%' },
  videoTile: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  videoSpacer: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  videoThumbnail: { width: '100%', height: '100%', borderRadius: 4 },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F1F1F', borderRadius: 4 },
  videoMeta: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  videoMetaText: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '700' },
  listFooter: { minHeight: 54, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  loadMoreButton: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9, marginTop: 8 },
  loadMoreText: { color: COLORS.cyan, fontWeight: '700' },
  emptyState: { alignItems: 'center', padding: 22 },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  stateText: { textAlign: 'center', lineHeight: 21, marginTop: 10 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
  noticeText: { color: '#E8B957', fontSize: 12, lineHeight: 17, marginHorizontal: 15, marginTop: 12 },
  suggestionError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
});
