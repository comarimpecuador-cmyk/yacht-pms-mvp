export type V2EventType =
  | 'entry'
  | 'exit'
  | 'service'
  | 'maintenance'
  | 'incident'
  | 'operation';

export type V2EventSubType =
  | 'port_arrival'
  | 'port_departure'
  | 'guest_boarding'
  | 'guest_disembark'
  | 'charter_service'
  | 'preventive_maintenance'
  | 'corrective_maintenance'
  | 'equipment_failure'
  | 'safety_incident'
  | 'medical_incident'
  | 'security_incident'
  | 'bridge_watch'
  | 'engine_watch'
  | 'navigation_note'
  | 'housekeeping'
  | 'other';

export type V2Category = 'nautical' | 'engineering' | 'guest_ops' | 'safety' | 'security' | 'admin';
export type V2Severity = 'info' | 'warn' | 'critical';

export type ClassificationResult = {
  eventType: V2EventType;
  eventSubType: V2EventSubType;
  category: V2Category;
  severity: V2Severity;
};

const INCIDENT_PATTERN = /(incident|accident|safety|security|lesion|injury|medic|alarma|emergenc)/i;
const MAINTENANCE_PATTERN = /(maintenance|repair|engine|motor|filtro|bomba|mantenimiento|maquina)/i;
const SERVICE_PATTERN = /(service|guest|charter|huesped|hospitalidad|catering|embarque)/i;
const ARRIVAL_PATTERN = /(arrival|entry|arribo|atraque|amarr)/i;
const DEPARTURE_PATTERN = /(departure|exit|zarpe|salida)/i;

export function classifyLegacyText(category: string, text: string): ClassificationResult {
  const source = `${category} ${text}`.toLowerCase();

  if (INCIDENT_PATTERN.test(source)) {
    return {
      eventType: 'incident',
      eventSubType: 'safety_incident',
      category: 'safety',
      severity: /critical|critico|grave|major/.test(source) ? 'critical' : 'warn',
    };
  }

  if (MAINTENANCE_PATTERN.test(source)) {
    return {
      eventType: 'maintenance',
      eventSubType: /preventive|preventivo/.test(source)
        ? 'preventive_maintenance'
        : 'corrective_maintenance',
      category: 'engineering',
      severity: /critical|critico|major/.test(source) ? 'critical' : 'warn',
    };
  }

  if (SERVICE_PATTERN.test(source)) {
    return {
      eventType: 'service',
      eventSubType: /disembark|desembarque/.test(source) ? 'guest_disembark' : 'charter_service',
      category: 'guest_ops',
      severity: 'info',
    };
  }

  if (ARRIVAL_PATTERN.test(source)) {
    return {
      eventType: 'entry',
      eventSubType: 'port_arrival',
      category: 'nautical',
      severity: 'info',
    };
  }

  if (DEPARTURE_PATTERN.test(source)) {
    return {
      eventType: 'exit',
      eventSubType: 'port_departure',
      category: 'nautical',
      severity: 'info',
    };
  }

  return {
    eventType: 'operation',
    eventSubType: 'navigation_note',
    category: 'nautical',
    severity: 'info',
  };
}

