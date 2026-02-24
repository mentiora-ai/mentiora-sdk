import React from 'react';
import Tabs from '@theme/Tabs';

const SDK_TAB_VALUES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
];

interface SdkTabsProps {
  children: React.ReactNode;
}

export default function SdkTabs({ children }: SdkTabsProps): React.JSX.Element {
  return (
    <Tabs groupId="sdk-language" values={SDK_TAB_VALUES}>
      {children}
    </Tabs>
  );
}
