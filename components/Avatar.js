import React, { useEffect, useState } from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../config/constants';
import { getProfilePicture } from '../config/profilePictureService';

export default function Avatar({
  uri,
  fallbackUrl,
  userId,
  name,
  size = 45,
  bordered = false,
  style,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initialUrl = fallbackUrl || uri || null;
  const [profilePictureUrl, setProfilePictureUrl] = useState(initialUrl);
  const [triedProfileLookup, setTriedProfileLookup] = useState(false);
  const base = { width: size, height: size, borderRadius: size / 2 };
  const border = bordered ? styles.border : null;

  useEffect(() => {
    setImageFailed(false);
    setProfilePictureUrl(fallbackUrl || uri || null);
    setTriedProfileLookup(false);
    if (!userId || fallbackUrl || uri) return undefined;

    let active = true;
    getProfilePicture(userId)
      .then((url) => {
        if (active) {
          setProfilePictureUrl(url);
          setTriedProfileLookup(true);
        }
      })
      .catch((error) => {
        console.error('Could not resolve avatar from profile pictures:', error);
        if (active) setTriedProfileLookup(true);
      });

    return () => {
      active = false;
    };
  }, [fallbackUrl, uri, userId]);

  const handleImageError = async () => {
    setImageFailed(true);
    if (!userId || triedProfileLookup) return;
    try {
      const url = await getProfilePicture(userId);
      if (url && url !== profilePictureUrl) {
        setProfilePictureUrl(url);
        setImageFailed(false);
      }
      setTriedProfileLookup(true);
    } catch (error) {
      console.error('Could not retry avatar lookup:', error);
      setTriedProfileLookup(true);
    }
  };

  if (profilePictureUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: profilePictureUrl }}
        style={[base, border, style]}
        onError={handleImageError}
      />
    );
  }
  return (
    <View style={[base, styles.placeholder, border, style]}>
      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: size * 0.4 }}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: COLORS.cyan, justifyContent: 'center', alignItems: 'center' },
  border: { borderWidth: 2, borderColor: COLORS.cyan },
});
