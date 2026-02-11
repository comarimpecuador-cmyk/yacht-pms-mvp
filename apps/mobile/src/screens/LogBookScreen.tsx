import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { getDb } from '../db/sqlite';

export function LogBookScreen() {
  const [engineHours, setEngineHours] = useState('');
  const [observation, setObservation] = useState('');
  const [message, setMessage] = useState('');

  const saveDraft = () => {
    const id = `logbook-${Date.now()}`;
    const payload = JSON.stringify({ engineHours, observation, status: 'Draft' });

    getDb().runSync(
      'INSERT INTO pending_ops (id, module, payload, created_at, status) VALUES (?, ?, ?, ?, ?)',
      [id, 'logbook', payload, new Date().toISOString(), 'draft'],
    );

    setMessage('Draft guardado en pending_ops');
    setEngineHours('');
    setObservation('');
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Log Book</Text>
      <TextInput
        value={engineHours}
        onChangeText={setEngineHours}
        placeholder="Horas de motor"
        keyboardType="numeric"
        style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 }}
      />
      <TextInput
        value={observation}
        onChangeText={setObservation}
        placeholder="Observación libre"
        multiline
        style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, minHeight: 100 }}
      />
      <Button title="Guardar Draft" onPress={saveDraft} />
      {message ? <Text style={{ color: '#0f766e' }}>{message}</Text> : null}
    </View>
  );
}
