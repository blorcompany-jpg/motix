import { useId, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { logoPaths } from '@motix/shared';
import { ApiFailure } from '@/lib/api';
import { colors, font, radii, space } from '@/lib/theme';

/* ---------- Marchio ---------- */

export function Mark({ size = 48, plain = false }: { size?: number; plain?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <SvgGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.acqua} />
          <Stop offset="1" stopColor={colors.energia} />
        </SvgGradient>
      </Defs>
      {!plain && <Rect width="120" height="120" rx="30" fill={colors.ardesia} />}
      <Path d={logoPaths.under} stroke={colors.ghiaccio} strokeWidth={logoPaths.strokeWidth} strokeLinecap="round" fill="none" />
      <Path d={logoPaths.rise} stroke={`url(#${id})`} strokeWidth={logoPaths.strokeWidth} strokeLinecap="round" fill="none" />
      <Circle cx={logoPaths.dot.cx} cy={logoPaths.dot.cy} r={logoPaths.dot.r} fill={colors.energia} />
    </Svg>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.26 }} accessibilityRole="header" accessibilityLabel="MOTIX">
      <Mark size={size} />
      <Text style={{ fontFamily: font.display, fontSize: size * 0.74, letterSpacing: -size * 0.03, color: colors.ghiaccio }}>
        moti<Text style={{ color: colors.energia }}>x</Text>
      </Text>
    </View>
  );
}

/* ---------- Testi ---------- */

export const H1 = (p: TextProps) => <Text {...p} style={[s.h1, p.style]} />;
export const H2 = (p: TextProps) => <Text {...p} style={[s.h2, p.style]} />;
export const H3 = (p: TextProps) => <Text {...p} style={[s.h3, p.style]} />;
export const Body = (p: TextProps) => <Text {...p} style={[s.body, p.style]} />;
export const Small = (p: TextProps) => <Text {...p} style={[s.small, p.style]} />;
export const Eyebrow = (p: TextProps) => <Text {...p} style={[s.eyebrow, p.style]} />;

/* ---------- Struttura della schermata ---------- */

export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  const content = <View style={s.screenInner}>{children}</View>;
  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer && <View style={s.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Card = (p: ViewProps) => <View {...p} style={[s.card, p.style]} />;

/* ---------- Azioni ---------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  inline,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'text';
  loading?: boolean;
  disabled?: boolean;
  /** Azione secondaria dentro una scheda: compatta e allineata a sinistra. */
  inline?: boolean;
}) {
  const off = disabled || loading;
  const label = loading ? <ActivityIndicator color={variant === 'primary' ? colors.notte : colors.ghiaccio} /> : null;
  if (variant === 'primary')
    return (
      <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [{ opacity: off ? 0.55 : pressed ? 0.85 : 1 }]}>
        <LinearGradient colors={[colors.acqua, colors.energia]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.btn}>
          {label ?? <Text style={s.btnPrimaryText}>{title}</Text>}
        </LinearGradient>
      </Pressable>
    );
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.btn, variant === 'ghost' && s.btnGhost, inline && s.btnInline, { opacity: off ? 0.55 : pressed ? 0.7 : 1 }]}
    >
      {label ?? <Text style={variant === 'ghost' ? s.btnGhostText : s.btnTextOnly}>{title}</Text>}
    </Pressable>
  );
}

/* ---------- Campi ---------- */

// Sul web il bordo colorato sostituisce il contorno predefinito del browser.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

export function Field({ label, error, hint, ...props }: { label: string; error?: string; hint?: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.pietra}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[s.input, webNoOutline, focused && { borderColor: colors.acqua }, error && { borderColor: colors.corallo }, props.style]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 }}
      >
        <View style={[s.box, checked && s.boxOn, error && !checked && { borderColor: colors.corallo }]}>
          {checked && (
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.notte} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          )}
        </View>
        <Text style={[s.body, { flex: 1, fontSize: 14, lineHeight: 20 }]}>{children}</Text>
      </Pressable>
      {error && !checked && <Text style={[s.fieldError, { marginLeft: 34 }]}>{error}</Text>}
    </View>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiFailure ? error.message : 'Si è verificato un errore: riprova';
  return (
    <View style={[s.alert, s.alertError]} accessibilityRole="alert">
      <Text style={{ color: '#FFC9BB', fontFamily: font.text, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' }) {
  return (
    <View style={[s.alert, tone === 'ok' ? s.alertOk : s.alertInfo]}>
      <Text style={{ color: tone === 'ok' ? '#DCF5A8' : '#BDEFFA', fontFamily: font.text, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export const fieldsOf = (e: unknown): Record<string, string> => (e instanceof ApiFailure ? e.fields : {});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.notte },
  screenInner: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: space.xl, gap: space.lg },
  footer: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.sm },
  h1: { fontFamily: font.displayHeavy, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: colors.ghiaccio },
  h2: { fontFamily: font.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.5, color: colors.ghiaccio },
  h3: { fontFamily: font.displaySemi, fontSize: 17, lineHeight: 22, color: colors.ghiaccio },
  body: { fontFamily: font.text, fontSize: 16, lineHeight: 23, color: colors.nebbia },
  small: { fontFamily: font.text, fontSize: 13, lineHeight: 18, color: colors.pietra },
  eyebrow: { fontFamily: font.textSemi, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.acqua },
  card: { backgroundColor: colors.ardesia, borderColor: colors.blu, borderWidth: 1, borderRadius: radii.lg, padding: space.lg, gap: space.sm },
  btn: { minHeight: 52, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  btnInline: { minHeight: 44, paddingHorizontal: 0, alignSelf: 'flex-start' },
  btnPrimaryText: { fontFamily: font.textSemi, fontSize: 16, color: colors.notte },
  btnGhost: { borderWidth: 1, borderColor: colors.blu },
  btnGhostText: { fontFamily: font.textSemi, fontSize: 16, color: colors.ghiaccio },
  btnTextOnly: { fontFamily: font.textSemi, fontSize: 15, color: colors.acqua },
  label: { fontFamily: font.textMedium, fontSize: 13, color: colors.nebbia },
  input: {
    fontFamily: font.text,
    fontSize: 16,
    color: colors.ghiaccio,
    backgroundColor: colors.ardesia,
    borderColor: colors.blu,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  fieldError: { fontFamily: font.text, fontSize: 12, color: colors.corallo },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.pietra, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.acqua, borderColor: colors.acqua },
  alert: { borderRadius: radii.md, borderWidth: 1, padding: 14 },
  alertError: { backgroundColor: 'rgba(255,122,89,0.12)', borderColor: 'rgba(255,122,89,0.5)' },
  alertInfo: { backgroundColor: 'rgba(56,211,238,0.10)', borderColor: 'rgba(56,211,238,0.4)' },
  alertOk: { backgroundColor: 'rgba(181,232,83,0.10)', borderColor: 'rgba(181,232,83,0.45)' },
});

/* ---------- Scelte ---------- */

export function Chip({ label, selected, onPress, hint }: { label: string; selected: boolean; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[x.chip, selected && x.chipOn, hint ? x.chipWide : null]}
    >
      <Text style={[x.chipText, selected && { color: colors.notte }]}>{label}</Text>
      {hint && <Text style={[x.chipHint, selected && { color: colors.ardesia }]}>{hint}</Text>}
    </Pressable>
  );
}

export const ChipRow = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

export function Pill({ children, tone = 'acqua' }: { children: ReactNode; tone?: 'acqua' | 'energia' | 'neutral' | 'corallo' }) {
  const c = tone === 'acqua' ? colors.acqua : tone === 'energia' ? colors.energia : tone === 'corallo' ? colors.corallo : colors.nebbia;
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, borderColor: c, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.textSemi, fontSize: 12, color: c }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewProps['style'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]}>{children}</View>;
}

/** Intestazione delle schermate interne, con il tasto per tornare indietro. */
export function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={12} style={x.back}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d="M15 5l-7 7 7 7" stroke={colors.ghiaccio} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Pressable>
      <Text style={[s.h3, { flex: 1 }]} numberOfLines={1}>{title}</Text>
    </Row>
  );
}

/* ---------- Grafici ---------- */

export function Ring({ value, goal, size = 120, stroke = 12, children }: { value: number; goal: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${Math.round(pct * 100)} per cento dell’obiettivo`}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.blu} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={pct >= 1 ? colors.energia : colors.acqua}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Colonne verticali; la colonna evidenziata usa il colore Acqua. */
export function Bars({ data, height = 96, highlightLast = true, goal }: { data: Array<{ label: string; value: number; goal?: number }>; height?: number; highlightLast?: boolean; goal?: boolean }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, goal ? (d.goal ?? 0) : 0)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: height + 20 }}>
      {data.map((d, i) => {
        const on = goal ? d.value >= (d.goal ?? Infinity) : highlightLast && i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ height, width: '100%', justifyContent: 'flex-end' }}>
              <View
                style={{
                  height: Math.max(d.value > 0 ? 4 : 2, (d.value / max) * height),
                  borderRadius: 6,
                  backgroundColor: d.value === 0 ? colors.blu : on ? (goal ? colors.energia : colors.acqua) : goal ? colors.acqua : colors.blu,
                }}
              />
            </View>
            <Text style={{ fontFamily: font.text, fontSize: 11, color: colors.pietra }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function HBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.textMedium, fontSize: 14, color: colors.ghiaccio }}>{label}</Text>
        <Text style={{ fontFamily: font.text, fontSize: 13, color: colors.nebbia }}>{value} {suffix}</Text>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.blu }}>
        <View style={{ height: 8, borderRadius: 4, width: `${Math.max(4, (value / Math.max(1, max)) * 100)}%`, backgroundColor: colors.acqua }} />
      </View>
    </View>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <View style={[s.card, { flex: 1, gap: 2, padding: 14 }]}>
      <Text style={{ fontFamily: font.display, fontSize: 24, color: colors.ghiaccio }}>{value}</Text>
      <Text style={{ fontFamily: font.text, fontSize: 12, color: colors.nebbia }}>{label}</Text>
    </View>
  );
}

/* ---------- Icone della barra in basso ---------- */

const ICONS = {
  home: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  piano: 'M3 12h2m14 0h2M6 7v10M18 7v10M9 9.5v5m6-5v5M9 12h6',
  progressi: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
  profilo: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7.5 9a7.5 7.5 0 0 1 15 0',
} as const;

export function TabIcon({ name, color, size = 24 }: { name: keyof typeof ICONS; color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={ICONS[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.acqua} />
    </View>
  );
}

const x = StyleSheet.create({
  chip: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.blu, backgroundColor: colors.ardesia, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  chipWide: { borderRadius: radii.md, width: '100%', paddingVertical: 12, gap: 2 },
  chipOn: { backgroundColor: colors.acqua, borderColor: colors.acqua },
  chipText: { fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio },
  chipHint: { fontFamily: font.text, fontSize: 13, color: colors.nebbia },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ardesia, alignItems: 'center', justifyContent: 'center' },
});
