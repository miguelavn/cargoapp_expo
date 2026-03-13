import React from 'react';
import ServicesListScreen from './ServicesListScreen';
import { usePermissions } from '../../../contexts/PermissionsContext';
import DriverServicesScreen from '../driver/DriverServicesScreen';
import { hasPermission } from '../../../api/edgeFunctions';

export default function ServicesScreen({ navigation, route }) {
  const { permissions } = usePermissions();

	if (hasPermission(permissions, 'view_the_services_assigned_to_me_at_my_company')) {
		return <DriverServicesScreen navigation={navigation} route={route} />;
	}

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

