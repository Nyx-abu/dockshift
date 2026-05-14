import { Component } from 'react';

/**
 * Wraps a single panel so a render/runtime error inside it can't take down the
 * whole dock. On error it shows a small dismissible card instead of a white
 * screen; dismissing resets the boundary and closes the panel.
 *
 * Props:
 *   - label:   human name of the wrapped panel (shown in the fallback)
 *   - onClose: optional; called when the user dismisses the error
 *   - children
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.label || 'panel'} crashed:`, error, info);
  }

  handleDismiss = () => {
    this.setState({ hasError: false, message: '' });
    if (this.props.onClose) this.props.onClose();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          bottom: 96,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          maxWidth: 320,
          padding: '14px 16px',
          borderRadius: 12,
          background: '#1a1c24',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          color: '#fff',
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          The {this.props.label || 'panel'} hit an error
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 10, wordBreak: 'break-word' }}>
          {this.state.message}
        </div>
        <button
          onClick={this.handleDismiss}
          style={{
            background: 'rgba(110,125,255,0.15)',
            border: '1px solid rgba(110,125,255,0.3)',
            borderRadius: 7,
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 500,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }
}
