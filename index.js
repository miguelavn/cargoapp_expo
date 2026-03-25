import { registerRootComponent } from 'expo';

// Instala filtros de consola en dev ANTES de cargar el resto de la app.
import './setupDevConsoleFilters';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
