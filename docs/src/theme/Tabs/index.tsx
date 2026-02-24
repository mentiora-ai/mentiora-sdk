import type { WrapperProps } from '@docusaurus/types';
import { useSdkLanguage } from '@site/src/hooks/useSdkLanguage';
import Tabs from '@theme-original/Tabs';
import type TabsType from '@theme/Tabs';
import React from 'react';

type Props = WrapperProps<typeof TabsType>;

const SDK_LANGUAGE_GROUP_ID = 'sdk-language';
const SDK_QUERY_PARAM = 'sdk';

export default function TabsWrapper(props: Props): React.JSX.Element {
  const { language } = useSdkLanguage();

  if (props.groupId === SDK_LANGUAGE_GROUP_ID) {
    // Use language as key so tabs re-initialize when the navbar switcher
    // changes the SDK language (Docusaurus Tabs ignores external URL changes
    // after mount because it manages its own internal state).
    return <Tabs key={language} {...props} queryString={SDK_QUERY_PARAM} />;
  }

  return <Tabs {...props} />;
}
