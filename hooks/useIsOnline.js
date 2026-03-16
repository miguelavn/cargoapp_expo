import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useIsOnline() {
	const [isConnected, setIsConnected] = useState(true);

	useEffect(() => {
		const sub = NetInfo.addEventListener((state) => {
			setIsConnected(state.isConnected === true);
		});

		return () => sub();
	}, []);

	return isConnected;
}
