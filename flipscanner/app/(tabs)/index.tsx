import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { requestScan, uploadScanImage } from '../../src/lib/scan';

export default function Scan() {
  const { session } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [askingPrice, setAskingPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>FlipScanner needs camera access to scan items.</Text>
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
    setAskingPrice('');
  };

  const usePhoto = async () => {
    if (!photoUri || !session) return;

    const purchasePrice = Number(askingPrice);

    setSubmitting(true);
    try {
      const storagePath = await uploadScanImage(session.user.id, photoUri);
      const scan = await requestScan(storagePath, {
        purchasePrice: askingPrice && Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : undefined,
      });
      setPhotoUri(null);
      setAskingPrice('');
      router.push(`/scan/${scan.id}`);
    } catch (error) {
      Alert.alert('Scan failed', error instanceof Error ? error.message : String(error));
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
            <Text style={styles.overlayText}>Identifying item & checking prices...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.previewBar}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TextInput
              style={styles.priceInput}
              placeholder="Asking price (optional)"
              placeholderTextColor="#ccc"
              keyboardType="decimal-pad"
              value={askingPrice}
              onChangeText={setAskingPrice}
            />
            <View style={styles.previewActions}>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={retake}>
                <Text style={styles.buttonText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={usePhoto}>
                <Text style={styles.buttonText}>Use Photo</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
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
  priceInput: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 16,
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
