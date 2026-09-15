/**
 * Automation using HA's target-based trigger/condition form
 * (`trigger: <domain>.<name>` / `condition: <domain>.<name>` + `target` + `options`).
 */
export const TARGETED_TRIGGER = {
  trigger: 'moon.phase_changed',
  target: { area_id: 'garden' },
  options: { phase: 'full_moon' },
};

export const TARGETED_ROOT_CONDITION = {
  condition: 'vibration.is_vibrating',
  target: { entity_id: 'binary_sensor.washer_vibration' },
  options: { behavior: 'any' },
};

export const TARGETED_CHOOSE_CONDITION = {
  condition: 'vibration.is_vibrating',
  target: { device_id: 'dryer_device' },
  options: { behavior: 'all' },
};

export const TARGETED_AUTOMATION_YAML = `
alias: Targeted triggers and conditions
triggers:
  - trigger: moon.phase_changed
    target:
      area_id: garden
    options:
      phase: full_moon
conditions:
  - condition: vibration.is_vibrating
    target:
      entity_id: binary_sensor.washer_vibration
    options:
      behavior: any
actions:
  - choose:
      - conditions:
          - condition: vibration.is_vibrating
            target:
              device_id: dryer_device
            options:
              behavior: all
        sequence:
          - action: notify.notify
            data:
              message: Dryer running
      - conditions:
          - condition: state
            entity_id: input_boolean.guest_mode
            state: "on"
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.hall
mode: single
`;
