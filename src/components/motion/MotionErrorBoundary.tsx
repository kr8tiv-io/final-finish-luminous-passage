import { Component, type ErrorInfo, type ReactNode } from 'react';
import { removeJourneyEnhancement } from '../../lib/motion/journey-director';

interface MotionErrorBoundaryProps {
  readonly children: ReactNode;
}

interface MotionErrorBoundaryState {
  readonly failed: boolean;
}

export default class MotionErrorBoundary extends Component<MotionErrorBoundaryProps, MotionErrorBoundaryState> {
  state: MotionErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MotionErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    removeJourneyEnhancement(document);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
