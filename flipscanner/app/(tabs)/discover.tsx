import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { requestDiscoveryIdentification, uploadDiscoveryImage } from '../../src/lib/discovery';

export default function Discover() {
  const { session } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          FlipScanner needs camera access to identify things you find.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  const takePicture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
    if (photo) {
      setPhotoUri(photo.uri);
    }
  };

  const retake = () => {
    setPhotoUri(null);
  };

  const usePhoto = async () => {
    if (!photoUri || !session) return;

    setSubmitting(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        }
      } catch {
        // Location is best-effort — proceed without it if unavailable.
      }

      const storagePath = await uploadDiscoveryImage(session.user.id, photoUri);
      const discovery = await requestDiscoveryIdentification(storagePath, { latitude, longitude });
      setPhotoUri(null);
      router.push(`/discovery/${discovery.id}`);
    } catch (error) {
      Alert.alert('Identification failed', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (photoUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photoUri }} style={styles.preview} />
        {submitting ? (
          <View style={styles.overlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.overlayText}>Identifying...</Text>
          </View>
        ) : (
          <View style={styles.previewBar}>
            <View style={styles.previewActions}>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={retake}>
                <Text style={styles.buttonText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={usePhoto}>
                <Text style={styles.buttonText}>Identify</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      <View style={styles.hintBar}>
        <Text style={styles.hintText}>Snap a photo of anything — rocks, wood, plants, terrain...</Text>
      </View>
      <View style={styles.captureBar}>
        <Pressable style={styles.captureButton} onPress={takePicture} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  message: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#fff',
    padding: 24,
  },
  hintBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  hintText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  captureBar: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  previewBar: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
