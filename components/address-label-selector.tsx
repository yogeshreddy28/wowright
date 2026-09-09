'use client';

import { BriefcaseBusiness, Check, Home, Pencil, UsersRound } from 'lucide-react';

export const ADDRESS_LABEL_TYPES = ['Home', 'Work', 'Friend / Family', 'Custom'] as const;
export type AddressLabelType = (typeof ADDRESS_LABEL_TYPES)[number];

const choices = [
  { value: 'Home', label: 'Home', Icon: Home },
  { value: 'Work', label: 'Work', Icon: BriefcaseBusiness },
  { value: 'Friend / Family', label: 'Friend / Family', Icon: UsersRound },
  { value: 'Custom', label: 'Custom', Icon: Pencil },
] as const;

export function AddressLabelSelector({
  value,
  onChange,
  customDefaultValue = '',
}: {
  value: string;
  onChange: (value: AddressLabelType) => void;
  customDefaultValue?: string;
}) {
  return (
    <div className="address-label-selector">
      <div>
        <b>Save this address as</b>
        <span>So you can choose it with one tap next time.</span>
      </div>
      <div className="address-label-options" role="radiogroup" aria-label="Save this address as">
        {choices.map(({ value: option, label, Icon }) => (
          <label className={value === option ? 'selected' : ''} key={option}>
            <input
              type="radio"
              name="labelType"
              value={option}
              required
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {value === option && <Check className="address-label-check" aria-hidden="true" />}
          </label>
        ))}
      </div>
      {value === 'Custom' && (
        <label className="address-custom-label">
          Address name
          <input name="customLabel" required maxLength={40} defaultValue={customDefaultValue} placeholder="e.g. Grandma’s house" />
        </label>
      )}
    </div>
  );
}
