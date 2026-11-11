import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config/constants';

const LAUNCH_AT = new Date(2027, 0, 1).getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function getTimeRemaining() {
  let remaining = Math.max(0, LAUNCH_AT - Date.now());
  const days = Math.floor(remaining / DAY);
  remaining %= DAY;
  const hours = Math.floor(remaining / HOUR);
  remaining %= HOUR;
  const minutes = Math.floor(remaining / MINUTE);
  remaining %= MINUTE;
  const seconds = Math.floor(remaining / SECOND);
  return { days, hours, minutes, seconds };
}

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
];

export default function LaunchCountdownCard() {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining);
  const isLive = Date.now() >= LAUNCH_AT;

  useEffect(() => {
    const timer = setInterval(() => setTimeRemaining(getTimeRemaining()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <LinearGradient
      colors={['#11262D', '#101820', '#12141B']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.heading}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles-outline" size={19} color={COLORS.cyan} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>MZANSIREELS LAUNCH</Text>
          <Text style={styles.title}>{isLive ? 'We’re live!' : 'Counting down to January 2027'}</Text>
        </View>
      </View>
      <View style={styles.countdownRow}>
        {UNITS.map((unit, index) => (
          <React.Fragment key={unit.key}>
            {index > 0 && <Text style={styles.separator}>:</Text>}
            <View style={styles.timeBlock}>
              <Text style={styles.value}>{String(timeRemaining[unit.key]).padStart(2, '0')}</Text>
              <Text style={styles.label}>{unit.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)' },
  heading: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  iconWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 11, borderRadius: 12, backgroundColor: 'rgba(0,229,255,0.10)' },
  copy: { flex: 1 },
  eyebrow: { color: COLORS.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  title: { color: '#F6F8FA', fontSize: 14, fontWeight: '800', marginTop: 3 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeBlock: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: '#1A2028' },
  value: { color: COLORS.cyan, fontSize: 19, lineHeight: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { color: '#89929D', fontSize: 9, fontWeight: '600', marginTop: 2 },
  separator: { color: '#65717D', fontSize: 17, fontWeight: '800', paddingHorizontal: 3 },
});
