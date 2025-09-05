import React from 'react';
import { View, ScrollView, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function MainShell({ children, displayName = 'Usuario', roleName = '', contentPaddingBottom = 88 }) {
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>
          <View style={styles.userHeader}>
            <View style={styles.avatarMock}>
              <MaterialIcons name="person" size={20} color="#333" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userNameText}>{getGreeting()}, {displayName}</Text>
              {!!roleName && <Text style={styles.userRoleText}>{roleName}</Text>}
            </View>
          </View>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#6C63FF',
  },
  contentContainer: {
    flexGrow: 1,
  },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    minHeight: '100%',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  avatarMock: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userNameText: { fontSize: 16, fontWeight: '700', color: '#333' },
  userRoleText: { fontSize: 12, color: '#666' },
});
