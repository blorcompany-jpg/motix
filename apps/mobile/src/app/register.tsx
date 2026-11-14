import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CONSENT_LABELS, MIN_AGE, TRIAL_DAYS, ageBand, type AuthResponse } from '@motix/shared';
import { Body, Button, Card, Checkbox, ErrorBox, Eyebrow, Field, H2, H3, Logo, Notice, Screen, Small, fieldsOf } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Step = 0 | 1 | 2;
const STEP_TITLES = ['I tuoi dati', 'Struttura e personal trainer', 'Consensi'] as const;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Campi che riportano l'utente al passo giusto quando il server segnala un errore. */
const FIELD_STEP: Record<string, Step> = {
  firstName: 0, lastName: 0, email: 0, password: 0, birthDate: 0, parent: 0, 'parent.name': 0, 'parent.email': 0,
  structureCode: 1, trainerCode: 1, referralCode: 1,
};

function Progress({ step }: { step: Step }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Passo ${step + 1} di 3`}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.acqua : colors.blu }} />
      ))}
    </View>
  );
}

export default function Register() {
  const { user, signIn } = useAuth();
  const params = useLocalSearchParams<{ struttura?: string; pt?: string; amico?: string }>();
  const [step, setStep] = useState<Step>(0);
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', password: '', day: '', month: '', year: '',
    parentName: '', parentEmail: '',
    structureCode: params.struttura ?? '', trainerCode: params.pt ?? '', referralCode: params.amico ?? '',
  });
  const [consents, setConsents] = useState({ terms: false, health_data: false, share_structure: false, share_trainer: false, marketing: false });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<{ structure?: string; trainer?: string }>({});
  const fe = { ...fieldsOf(error), ...local };
  /** Chiave dell'errore mostrato per ogni campo: correggendo il campo, il suo errore sparisce. */
  const errorKey: Partial<Record<keyof typeof f, string>> = {
    day: 'birthDate', month: 'birthDate', year: 'birthDate', parentName: 'parent.name', parentEmail: 'parent.email',
  };
  const set = (k: keyof typeof f) => (v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    const key = errorKey[k] ?? k;
    setLocal((e) => {
      if (!(key in e)) return e;
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };

  const birthDate = useMemo(() => {
    const d = Number(f.day), m = Number(f.month), y = Number(f.year);
    if (!d || !m || f.year.length !== 4) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return `${f.year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }, [f.day, f.month, f.year]);
  const band = birthDate ? ageBand(birthDate) : null;

  if (user) return <Redirect href="/home" />;

  const validate = (s: Step) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!f.firstName.trim()) e.firstName = 'Inserisci il nome';
      if (!f.lastName.trim()) e.lastName = 'Inserisci il cognome';
      if (!isEmail(f.email)) e.email = 'Email non valida';
      if (f.password.length < 8) e.password = 'Almeno 8 caratteri';
      if (!birthDate) e.birthDate = 'Data non valida';
      else if (band === 'too_young') e.birthDate = `Per usare MOTIX devi avere almeno ${MIN_AGE} anni`;
      if (band === 'minor') {
        if (!f.parentName.trim()) e['parent.name'] = 'Inserisci il nome del genitore';
        if (!isEmail(f.parentEmail)) e['parent.email'] = 'Email non valida';
        else if (f.parentEmail.trim().toLowerCase() === f.email.trim().toLowerCase()) e['parent.email'] = 'Usa l’email di un genitore, non la tua';
      }
    }
    if (s === 2) {
      if (!consents.terms) e['consents.terms'] = 'Consenso obbligatorio';
      if (!consents.health_data) e['consents.health_data'] = 'Consenso obbligatorio';
    }
    setLocal(e);
    return Object.keys(e).length === 0;
  };

  /** Verifica i codici prima di proseguire, così un codice sbagliato si corregge subito. */
  const checkCodes = async () => {
    const e: Record<string, string> = {};
    const found: typeof checked = {};
    setBusy(true);
    try {
      if (f.structureCode.trim())
        await api('GET', `/public/structures/${encodeURIComponent(f.structureCode.trim())}`)
          .then((r) => (found.structure = `${r.displayName} · ${r.city}`))
          .catch(() => (e.structureCode = 'Codice della struttura non valido'));
      if (f.trainerCode.trim())
        await api('GET', `/public/trainers/${encodeURIComponent(f.trainerCode.trim())}`)
          .then((r) => (found.trainer = `${r.firstName} ${r.lastName}`))
          .catch(() => (e.trainerCode = 'Codice del personal trainer non valido'));
    } finally {
      setBusy(false);
    }
    setChecked(found);
    setLocal(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    setError(null);
    if (step === 0 && validate(0)) setStep(1);
    else if (step === 1 && (await checkCodes())) setStep(2);
    else if (step === 2 && validate(2)) await submit();
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<AuthResponse | { pendingParentalConsent: true }>('POST', '/auth/register', {
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        password: f.password,
        birthDate,
        consents,
        structureCode: f.structureCode.trim() || undefined,
        trainerCode: f.trainerCode.trim() || undefined,
        referralCode: f.referralCode.trim() || undefined,
        parent: band === 'minor' ? { name: f.parentName, email: f.parentEmail } : undefined,
      });
      if ('pendingParentalConsent' in res)
        router.replace({ pathname: '/attesa-consenso', params: { email: f.email.trim().toLowerCase(), parentEmail: f.parentEmail.trim() } });
      else {
        await signIn(res);
        router.replace('/home');
      }
    } catch (e) {
      setError(e);
      const first = Object.keys(fieldsOf(e))[0];
      if (first && FIELD_STEP[first] !== undefined) setStep(FIELD_STEP[first]);
    } finally {
      setBusy(false);
    }
  };

  const back = () => (step === 0 ? router.back() : setStep((step - 1) as Step));

  return (
    <Screen
      footer={
        <>
          <Button title={step === 2 ? `Crea l’account e inizia la prova` : 'Continua'} onPress={next} loading={busy} />
          <Button title={step === 0 ? 'Ho già un account' : 'Indietro'} variant="text" onPress={step === 0 ? () => router.replace('/login') : back} />
        </>
      }
    >
      <Logo size={32} />
      <Progress step={step} />
      <View style={{ gap: 4 }}>
        <Eyebrow>Passo {step + 1} di 3</Eyebrow>
        <H2>{STEP_TITLES[step]}</H2>
      </View>
      <ErrorBox error={error} />

      {step === 0 && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="Nome" value={f.firstName} onChangeText={set('firstName')} error={fe.firstName} autoComplete="given-name" textContentType="givenName" /></View>
            <View style={{ flex: 1 }}><Field label="Cognome" value={f.lastName} onChangeText={set('lastName')} error={fe.lastName} autoComplete="family-name" textContentType="familyName" /></View>
          </View>
          <Field label="Email" value={f.email} onChangeText={set('email')} error={fe.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={f.password} onChangeText={set('password')} error={fe.password} hint="Almeno 8 caratteri" secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="Giorno" value={f.day} onChangeText={set('day')} keyboardType="number-pad" maxLength={2} placeholder="GG" /></View>
              <View style={{ flex: 1 }}><Field label="Mese" value={f.month} onChangeText={set('month')} keyboardType="number-pad" maxLength={2} placeholder="MM" /></View>
              <View style={{ flex: 1.4 }}><Field label="Anno di nascita" value={f.year} onChangeText={set('year')} keyboardType="number-pad" maxLength={4} placeholder="AAAA" /></View>
            </View>
            {fe.birthDate ? <Small style={{ color: colors.corallo }}>{fe.birthDate}</Small> : <Small>Serve per adattare il piano. Età minima {MIN_AGE} anni.</Small>}
          </View>
          {band === 'minor' && (
            <Card>
              <H3>Consenso di un genitore</H3>
              <Small style={{ color: colors.nebbia }}>
                Hai meno di 18 anni: scriviamo a un tuo genitore e l’account si attiva appena dà il consenso.
              </Small>
              <Field label="Nome e cognome del genitore" value={f.parentName} onChangeText={set('parentName')} error={fe['parent.name'] ?? fe.parent} />
              <Field label="Email del genitore" value={f.parentEmail} onChangeText={set('parentEmail')} error={fe['parent.email']} keyboardType="email-address" autoCapitalize="none" />
            </Card>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <Body>Se la tua palestra o il tuo personal trainer ti hanno dato un codice, inseriscilo qui. Puoi anche farlo dopo.</Body>
          <Field label="Codice della struttura (facoltativo)" value={f.structureCode} onChangeText={set('structureCode')} error={fe.structureCode} autoCapitalize="characters" autoCorrect={false} placeholder="MX…" />
          <Field label="Codice del personal trainer (facoltativo)" value={f.trainerCode} onChangeText={set('trainerCode')} error={fe.trainerCode} autoCapitalize="characters" autoCorrect={false} placeholder="PT…" />
          <Field label="Codice di un amico (facoltativo)" value={f.referralCode} onChangeText={set('referralCode')} error={fe.referralCode} autoCapitalize="characters" autoCorrect={false} placeholder="AM…" />
        </>
      )}

      {step === 2 && (
        <>
          {(checked.structure || checked.trainer) && (
            <Notice tone="ok">
              {[checked.structure && `Struttura: ${checked.structure}`, checked.trainer && `Personal trainer: ${checked.trainer}`].filter(Boolean).join('\n')}
            </Notice>
          )}
          <Card>
            <H3>Obbligatori</H3>
            <Checkbox checked={consents.terms} onChange={(v) => setConsents({ ...consents, terms: v })} error={fe['consents.terms']}>
              {CONSENT_LABELS.terms}
            </Checkbox>
            <Checkbox checked={consents.health_data} onChange={(v) => setConsents({ ...consents, health_data: v })} error={fe['consents.health_data']}>
              {CONSENT_LABELS.health_data}: peso, allenamenti e idratazione, per personalizzare il piano
            </Checkbox>
          </Card>
          <Card>
            <H3>Facoltativi</H3>
            <Small style={{ color: colors.nebbia }}>Puoi cambiarli quando vuoi dal profilo.</Small>
            <Checkbox checked={consents.share_structure} onChange={(v) => setConsents({ ...consents, share_structure: v })}>{CONSENT_LABELS.share_structure}</Checkbox>
            <Checkbox checked={consents.share_trainer} onChange={(v) => setConsents({ ...consents, share_trainer: v })}>{CONSENT_LABELS.share_trainer}</Checkbox>
            <Checkbox checked={consents.marketing} onChange={(v) => setConsents({ ...consents, marketing: v })}>{CONSENT_LABELS.marketing}</Checkbox>
          </Card>
          <Small>
            La prova dura {TRIAL_DAYS} giorni con tutte le funzioni Premium. L’abbonamento parte solo se lo attivi dallo store, e puoi disdirlo durante la prova.
          </Small>
        </>
      )}
    </Screen>
  );
}
