import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CYAN = '#00E5FF';

export default function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onAttachment,
  onVoiceNote,
  showEmojiPicker,
  onToggleEmojiPicker,
  onInputFocus,
  onStickerPress,
  recording = false,
  recordingSeconds = 0,
  onStopRecording,
  onDiscardRecording,
  sending = false,
  disabled = false,
}) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onAttachment}
        disabled={disabled || sending}
        accessibilityRole="button"
        accessibilityLabel="Attach photo or video"
      >
        <Ionicons name="image-outline" size={23} color={CYAN} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.iconButton, showEmojiPicker && styles.emojiButtonActive]}
        onPress={onToggleEmojiPicker}
        onLongPress={onStickerPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: showEmojiPicker }}
        accessibilityLabel="Open emoji picker; long press for stickers"
      >
        <Ionicons name="happy-outline" size={23} color={CYAN} />
      </TouchableOpacity>
      {recording ? (
        <>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onDiscardRecording}
            accessibilityRole="button"
            accessibilityLabel="Discard voice note"
          >
            <Ionicons name="trash-outline" size={21} color="#FF0055" />
          </TouchableOpacity>
          <View style={styles.recordingTime}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              REC {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sendButton}
            onPress={onStopRecording}
            accessibilityRole="button"
            accessibilityLabel="Stop and send voice note"
          >
            <Ionicons name="stop" size={18} color="#0B0D12" />
          </TouchableOpacity>
        </>
      ) : null}
      {!recording ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#8B95A7"
            value={value}
            onChangeText={onChangeText}
            onFocus={onInputFocus}
            editable={!disabled}
            multiline
            maxLength={4000}
            underlineColorAndroid="transparent"
            selectionColor={CYAN}
            accessibilityLabel="Message"
          />
          {value.trim() ? (
            <TouchableOpacity
              style={[styles.sendButton, (sending || disabled) && styles.sendButtonDisabled]}
              onPress={onSend}
              disabled={sending || disabled}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending
                ? <ActivityIndicator size="small" color="#0B0D12" />
                : <Ionicons name="paper-plane" size={18} color="#0B0D12" />}
            </TouchableOpacity>
          ) : onVoiceNote ? (
            <TouchableOpacity
              style={styles.trailingIconButton}
              onPress={onVoiceNote}
              disabled={disabled || sending}
              accessibilityRole="button"
              accessibilityLabel="Record voice note"
            >
              <Ionicons name="mic-outline" size={23} color={CYAN} />
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#222222',
    backgroundColor: '#121212',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonActive: {
    borderRadius: 20,
    backgroundColor: '#252A35',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 20,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: '#1A1A1A',
    outlineStyle: 'none',
    textAlignVertical: 'center',
  },
  trailingIconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: CYAN,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  recordingTime: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
    backgroundColor: '#FF0055',
  },
  recordingText: {
    padding: 0,
    color: '#FF0055',
    fontSize: 12,
    fontWeight: '700',
  },
});
