import { PlacesApp } from '@/components/places/places-app';
import { PlacesErrorBoundary } from '@/components/places/places-error-boundary';

export default function Home() {
  return (
    <PlacesErrorBoundary>
      <PlacesApp />
    </PlacesErrorBoundary>
  );
}
