/**
 * OnboardingScreen — 3 intro slides + page indicator + Skip button.
 *
 * Slide 1: "Chat in your language"        — icon 💬
 * Slide 2: "End-to-end encrypted"          — icon 🔒
 * Slide 3: "Real-time translation"         — icon 🌐
 *
 * Each slide is rendered as a card on the cream background. The last slide
 * shows a "Get Started" button that navigates to Login.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { RootStackParamList } from '../types';
import { FeatherIconName } from '../types/iconNames';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: FeatherIconName;
  emoji: string;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'message-circle',
    emoji: '💬',
    title: 'Chat in your language',
    subtitle: 'Send messages in your native tongue. We handle the rest.',
  },
  {
    id: '2',
    icon: 'lock',
    emoji: '🔒',
    title: 'End-to-end encrypted',
    subtitle: 'Your conversations stay private — only you and your contact can read them.',
  },
  {
    id: '3',
    icon: 'globe',
    emoji: '🌐',
    title: 'Real-time translation',
    subtitle: 'Messages arrive already translated. No copy-pasting, no waiting.',
  },
];

export function OnboardingScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    }
  };

  const goToLogin = () => {
    navigation.replace('Login');
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather name={item.icon} size={56} color={colors.accent} />
        </View>
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>

      {item.id === String(SLIDES.length) && (
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={goToLogin}
        >
          <Text style={styles.ctaText}>Get Started</Text>
          <Feather name="arrow-right" size={18} color={colors.textInverse} />
        </Pressable>
      )}

      {item.id !== String(SLIDES.length) && (
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={goNext}
        >
          <Text style={styles.ctaText}>Next</Text>
          <Feather name="chevron-right" size={18} color={colors.textInverse} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.skipRow}>
        <Pressable onPress={goToLogin} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        renderItem={renderSlide}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      <View style={[styles.indicatorRow, { paddingBottom: insets.bottom + spacing.xl }]}>
        {SLIDES.map((slide, idx) => (
          <View
            key={slide.id}
            style={[styles.dot, idx === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxxl,
    alignItems: 'center',
    // Subtle elevation
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.badgeBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emoji: {
    fontSize: fontSize.hero,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.bodyLg,
    textAlign: 'center',
    lineHeight: fontSize.bodyLg * 1.45,
  },
  cta: {
    marginTop: spacing.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    minWidth: 220,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    color: colors.textInverse,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});

export default OnboardingScreen;
