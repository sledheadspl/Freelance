import { StyleSheet, Text, View } from 'react-native';

export default function History() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan History</Text>
      <Text style={styles.subtitle}>Your past scans and watchlist will show up here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: '#666',
    textAlign: 'center',
  },
});
