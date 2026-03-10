import React from 'react';
import ServicesListScreen from './ServicesListScreen';
import { usePermissions } from '../../../contexts/PermissionsContext';

export default function ServicesScreen({ navigation, route }) {
  const { permissions } = usePermissions();
  return (
    <ServicesListScreen
      navigation={navigation}
      route={{
        ...(route || {}),
        params: {
          ...(route?.params || {}),
          permissions,
          hideBack: true,
        },
      }}
    />
  );
}
