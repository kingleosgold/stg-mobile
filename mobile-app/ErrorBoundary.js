/**
 * Error Boundary Component
 * 
 * Catches unhandled errors in the React component tree
 * Prevents the entire app from crashing
 */

import React, { Component } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console (in production, you'd send this to an error tracking service)
    console.error('🚨 App Error Caught by ErrorBoundary:', error);
    console.error('Component Stack:', errorInfo.componentStack);

    this.setState({
      error,
      errorInfo,
    });

    // TODO: Send error to tracking service (Sentry, Bugsnag, etc.)
    // trackError(error, errorInfo);
  }

  handleReload = async () => {
    try {
      // Try to reload the app
      await Updates.reloadAsync();
    } catch (error) {
      // If reload fails, just reset the error state
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  };

  render() {
    if (this.state.hasError) {
      // Render error UI
      const { error, errorInfo } = this.state;

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.subtitle}>
              The app encountered an unexpected error. Don't worry, your data is safe.
            </Text>

            <TouchableOpacity
              style={styles.reloadButton}
              onPress={this.handleReload}
              activeOpacity={0.8}
            >
              <Text style={styles.reloadButtonText}>Reload App</Text>
            </TouchableOpacity>

            {__DEV__ && error && (
              <ScrollView style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details (Dev Mode Only):</Text>
                <Text style={styles.errorText}>
                  {error.toString()}
                </Text>
                {errorInfo && (
                  <Text style={styles.errorStack}>
                    {errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    maxWidth: 500,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
  },
  reloadButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  reloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  errorDetails: {
    backgroundColor: '#18181b',
    padding: 16,
    borderRadius: 8,
    maxHeight: 300,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fbbf24',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  errorStack: {
    fontSize: 10,
    color: '#71717a',
    fontFamily: 'monospace',
  },
});

export default ErrorBoundary;
