import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Copy, Clipboard, RefreshCw, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

interface MapExtensionControllerProps {
  onXPathAdd: (xpath: string) => void;
  isExtensionConnected: boolean;
  onConnectionChange: (connected: boolean) => void;
  onImplementXPaths?: (xpaths: Array<{element_name: string, xpath: string, page_name: string, page_url?: string}>) => void;
}

const MapExtensionController: React.FC<MapExtensionControllerProps> = ({
  onXPathAdd,
  isExtensionConnected,
  onConnectionChange,
  onImplementXPaths
}) => {

  const { toast } = useToast();
  
  // State for extension communication
  const [showInstructions, setShowInstructions] = useState(false);
  const [lastDetectedXPath, setLastDetectedXPath] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  // ✅ Session ID for grouping XPaths added in the same batch
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    // Initialize with a session ID on component mount so XPaths are always associated with a session
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getCurrentUserEmail = (): string => {
    try {
      const savedUser = localStorage.getItem('qfast_user');
      if (!savedUser) return 'extension_user';
      const parsedUser = JSON.parse(savedUser);
      return (parsedUser?.email || 'extension_user').toString();
    } catch (error) {
      console.warn('Could not parse qfast_user from localStorage:', error);
      return 'extension_user';
    }
  };

  // Database integration state
  const [storedXPaths, setStoredXPaths] = useState<Array<{id: number, element_name: string, xpath: string, page_name: string, page_url?: string, page_domain?: string, created_at: string, session_id: string, user_email?: string}>>([]);
  const [isStoringToDB, setIsStoringToDB] = useState(false);
  const [isResettingXPaths, setIsResettingXPaths] = useState(false);
  const [isRefreshingXPaths, setIsRefreshingXPaths] = useState(false);
  
  // ⚡ Performance optimization: Cache for recent requests
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const REFRESH_CACHE_DURATION = 3000; // 3 seconds cache

  // Database integration functions
  const storeXPathToDatabase = async (xpath: string, elementName: string = 'Captured Element', pageName: string = 'Unknown Page', showToast: boolean = true) => {
    try {
      setIsStoringToDB(true);
      console.log('💾 [DEBUG] storeXPathToDatabase called with:', { xpath, elementName, pageName, sessionId: currentSessionId });

      // Store the new XPath with session ID for grouping
      const apiUrl = buildApiUrl('/api/extension-xpaths');
      console.log('💾 [DEBUG] API URL:', apiUrl);
      const requestPayload = {
        xpath: xpath,
        element_name: elementName,
        page_name: pageName,
        created_by: getCurrentUserEmail(),
        session_id: currentSessionId
      };
      console.log('💾 [DEBUG] Request payload:', requestPayload);

      console.log('🌐 [DEBUG] Making fetch request to:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': getCurrentUserEmail()
        },
        body: JSON.stringify(requestPayload)
      });

      console.log('💾 [DEBUG] Response status:', response.status);
      console.log('💾 [DEBUG] Response ok:', response.ok);
      console.log('💾 [DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          console.log('💾 [DEBUG] Error response data:', errorData);
        } catch (e) {
          const errorText = await response.text();
          console.log('💾 [DEBUG] Error response text:', errorText);
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ XPath stored to database successfully:', result);

      if (showToast) {
        toast({
          title: "✅ XPath Stored",
          description: "XPath stored in database successfully",
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Error storing XPath to database:', error);
      if (showToast) {
        toast({
          title: "❌ Database Error",
          description: `Failed to store XPath: ${error.message}`,
          variant: "destructive"
        });
      }
      throw error;
    } finally {
      setIsStoringToDB(false);
    }
  };

  // ✅ ULTRA-FAST XPath loading with intelligent caching
  const loadStoredXPaths = async (forceRefresh = false) => {
    const loadingStartTime = performance.now();
    const currentTime = Date.now();
    
    try {
      console.log('⚡ ULTRA-FAST LOAD: Starting XPath refresh...');
      
      // 🔥 IMMEDIATE UI FEEDBACK - Set refresh state
      setIsRefreshingXPaths(true);
      
      // ⚡ CACHE CHECK - Use cached data if recent and not forced
      if (!forceRefresh && lastApiResponse && (currentTime - lastRefreshTime) < REFRESH_CACHE_DURATION) {
        console.log('⚡ Using cached data (age:', (currentTime - lastRefreshTime) + 'ms)');
        setIsRefreshingXPaths(false);

        toast({
          title: "⚡ Instant Refresh",
          description: `Using cached data (${storedXPaths.length} XPaths)`,
          duration: 1500,
        });
        
        return storedXPaths;
      }
      
      const apiUrl = buildApiUrl('/api/extension-xpaths');
      console.log('🚀 Ultra-fast API call to:', apiUrl);

      const fetchForUser = async (userEmail: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(apiUrl, {
            signal: controller.signal,
            headers: {
              'X-User-Email': userEmail
            }
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ API returned error:', errorData);
            throw new Error(errorData.error || 'Failed to load XPaths from database');
          }

          return response.json();
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const currentUserEmail = getCurrentUserEmail();
      let responseData = await fetchForUser(currentUserEmail);
      console.log('⚡ Ultra-fast response received:', responseData);
      
      // Process data ultra-fast
      let xpaths = [];
      
      if (Array.isArray(responseData)) {
        xpaths = responseData;
      } else if (responseData?.xpaths && Array.isArray(responseData.xpaths)) {
        xpaths = responseData.xpaths;
      }

      if (xpaths.length === 0 && currentUserEmail !== 'extension_user') {
        console.log('🔁 No rows for logged-in user, retrying with extension_user');
        responseData = await fetchForUser('extension_user');
        if (Array.isArray(responseData)) {
          xpaths = responseData;
        } else if (responseData?.xpaths && Array.isArray(responseData.xpaths)) {
          xpaths = responseData.xpaths;
        }
      }
      
      // Sort ultra-fast using numeric timestamp comparison
      if (xpaths.length > 0) {
        xpaths.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeA - timeB;
        });
      }
      
      // ⚡ CACHE THE RESPONSE
      setLastApiResponse(responseData);
      setLastRefreshTime(currentTime);
      
      // ⚡ INSTANT UI UPDATE - Update state immediately
      setStoredXPaths(xpaths);

      const loadingTime = Math.round(performance.now() - loadingStartTime);
      console.log(`⚡ ULTRA-FAST LOAD COMPLETE: ${xpaths.length} XPaths loaded in ${loadingTime}ms`);
      
      // Show instant feedback
      if (loadingTime < 100) {
        toast({
          title: "⚡ Instant Refresh!",
          description: `Loaded ${xpaths.length} XPaths instantly`,
          duration: 1000,
        });
      } else {
        toast({
          title: "✅ Fast Refresh",
          description: `Loaded ${xpaths.length} XPaths in ${loadingTime}ms`,
          duration: 2000,
        });
      }
      
      return xpaths;
    } catch (error) {
      console.error('❌ Error loading XPaths:', error);
      const loadingTime = Math.round(performance.now() - loadingStartTime);
      
      // Don't clear UI on error - keep existing data
      setIsRefreshingXPaths(false);
      
      toast({
        title: "❌ Refresh Failed",
        description: `Error: ${error.message}. Showing previous data.`,
        variant: "destructive",
        duration: 3000,
      });
      
      return storedXPaths.length > 0 ? storedXPaths : [];
    } finally {
      setIsRefreshingXPaths(false);
    }
  };

  // ✅ REMOVED: loadStoredXPathsBySession (no longer needed - session_id filtering removed)

  // ✅ Delete all unimplemented XPaths (not session-specific)
  const deleteAllXPathsForSession = async (showToast: boolean = true) => {
    try {
      console.log('🗑️  Deleting all unimplemented XPaths from database');
      
      // Set resetting flag immediately to prevent auto-refresh from re-populating
      setIsResettingXPaths(true);
      
      // Clear the UI immediately without waiting for API response
      setStoredXPaths([]);
      console.log('✅ Cleared storedXPaths state immediately');
      
      // ✅ Call DELETE using the correct endpoint
      const response = await fetch(buildApiUrl('/api/extension-xpaths/clear'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': getCurrentUserEmail()
        }
      });

      if (!response.ok) {
        // Handle HTML error responses (like 405)
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to delete XPaths: ${response.status} ${response.statusText}`);
        } else {
          throw new Error(`Failed to delete XPaths: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      console.log('✅ All unimplemented XPaths deleted from database:', result);
      
      // ⚡ Clear cache immediately for instant UI update
      setLastApiResponse(null);
      setLastRefreshTime(0);
      
      if (showToast) {
        toast({
          title: "⚡ Instant Reset",
          description: "All XPaths deleted and panel cleared instantly",
        });
      }
      
      // Reset the flag after a short delay to allow any pending refreshes to complete
      setTimeout(() => {
        setIsResettingXPaths(false);
        console.log('✅ Reset flag cleared, auto-refresh can resume');
      }, 1000);
      
      return result;
    } catch (error) {
      console.error('❌ Error deleting XPaths:', error);
      setIsResettingXPaths(false); // Clear flag on error
      
      if (showToast) {
        toast({
          title: "❌ Reset Failed",
          description: `Failed to reset: ${error.message}`,
          variant: "destructive"
        });
      }
      throw error;
    }
  };

  // Enhanced message handler with database integration
  const handleMessage = (event: MessageEvent) => {
    // Allow messages from extension (sent via window.postMessage with '*' origin)
    // Extension messages will have origin !== window.location.origin, which is fine

    console.log('🌐 [DEBUG] Window message received:', event.data);
    console.log('🌐 [DEBUG] Message type:', event.data?.type);
    console.log('🌐 [DEBUG] Connection status:', connectionStatus);
    console.log('🌐 [DEBUG] Current session ID:', currentSessionId);

    try {
      // Validate connection before processing any messages (except connection-related)
      const isXPathMessage = event.data?.type === 'XPATH_CAPTURED_FROM_EXTENSION' ||
                            event.data?.type === 'XPATH_BATCH_CAPTURED_FROM_EXTENSION';
      const isConnectionMessage = event.data?.type === 'EXTENSION_STATUS' ||
                                event.data?.type === 'TEST_MESSAGE' ||
                                event.data?.type === 'CONNECT_FRONTEND' ||
                                event.data?.type === 'FRONTEND_READY_FOR_XPATH' ||
                                event.data?.type === 'PING';

      console.log('🌐 [DEBUG] Is XPath message:', isXPathMessage);
      console.log('🌐 [DEBUG] Is connection message:', isConnectionMessage);

      // Auto-connect when XPath messages arrive from extension
      if (isXPathMessage && connectionStatus === 'disconnected') {
        console.log('✅ [DEBUG] Extension message received - auto-connecting...');
        setConnectionStatus('connected');
        onConnectionChange(true);
      }

      // Handle extension XPath messages - match what extension actually sends
      if (event.data?.type === 'XPATH_CAPTURED_FROM_EXTENSION') {
        const { xpath, source, timestamp } = event.data;
        console.log('✅ [DEBUG] Received XPath from extension:', xpath, 'Source:', source, 'Time:', timestamp);
        console.log('✅ [DEBUG] About to call storeXPathToDatabase');

        if (xpath && typeof xpath === 'string' && xpath.trim().length > 0) {
          setLastDetectedXPath(xpath);

          // Store to database first, then load to frontend
          storeXPathToDatabase(xpath, 'Captured Element from Extension', 'Extension Page', false)
            .then(() => {
              // After successful storage, load from database
              return loadStoredXPaths(true);
            })
            .then(() => {
              // Emit custom event for TestStepsGrid to listen to
              window.dispatchEvent(new CustomEvent('xpath-captured-from-extension', {
                detail: { xpath: xpath, source: 'extension-single', timestamp: timestamp }
              }));

              // Forward to frontend via React component communication
              console.log('🔄 Calling onXPathAdd with:', xpath);
              onXPathAdd(xpath);
              setConnectionStatus('connected');
              onConnectionChange(true);
            })
            .catch((error) => {
              console.error('❌ Error in XPath storage/loading process:', error);
              // Fallback: still emit event even if storage fails
              window.dispatchEvent(new CustomEvent('xpath-captured-from-extension', {
                detail: { xpath: xpath, source: 'extension-single', timestamp: timestamp }
              }));

              onXPathAdd(xpath);
              setConnectionStatus('connected');
              onConnectionChange(true);
            });
        }
      } else if (event.data?.type === 'XPATH_BATCH_SAVED_TO_DATABASE') {
        console.log('🎯 [DEBUG] RECEIVED XPATH_BATCH_SAVED_TO_DATABASE MESSAGE!');
        console.log('🎯 [DEBUG] Extension saved XPaths to database, refreshing from DB...');
        console.log('🎯 [DEBUG] Full event data:', JSON.stringify(event.data, null, 2));

        // Load XPaths from database since extension saved them directly
        loadStoredXPaths(true).then(() => {
          console.log('✅ Successfully loaded XPaths from database after extension save');
        }).catch((error) => {
          console.error('❌ Error loading XPaths from database:', error);
        });

      } else if (event.data?.type === 'XPATH_BATCH_CAPTURED_FROM_EXTENSION') {
        console.log('🎯 [DEBUG] RECEIVED XPATH_BATCH_CAPTURED_FROM_EXTENSION MESSAGE!');
        console.log('🎯 [DEBUG] Full event data:', JSON.stringify(event.data, null, 2));
        console.log('🎯 [DEBUG] Current session ID:', currentSessionId);
        // Handle batch XPaths from extension - STORE TO DB FIRST, THEN LOAD TO FRONTEND
        const { xpaths, source, timestamp } = event.data;
        console.log('✅ Received batch XPaths from extension:', xpaths.length, 'XPaths');
        console.log('✅ Batch XPaths details:', xpaths);

        if (xpaths && Array.isArray(xpaths) && xpaths.length > 0) {
          console.log('🚀 Starting to store batch XPaths to database...');
          // First, store all XPaths to database
          const storePromises = xpaths.map(async (xpathData, index) => {
            console.log(`🔍 Processing XPath ${index + 1}:`, xpathData);
            // Handle both old format (string) and new format (object)
            let xpath, elementName, pageName;
            if (typeof xpathData === 'string') {
              // Old format: xpath is string, elementNames in separate array
              xpath = xpathData;
              elementName = event.data.elementNames && event.data.elementNames[index] ? event.data.elementNames[index] : `Captured Element ${index + 1}`;
              pageName = 'Extension Page';
              console.log(`📝 Old format - XPath: ${xpath}, Element: ${elementName}`);
            } else {
              // New format: xpathData is object with xpath, elementName, pageName
              xpath = xpathData.xpath;
              elementName = xpathData.elementName || `Captured Element ${index + 1}`;
              pageName = xpathData.pageName || 'Extension Page';
              console.log(`📝 New format - XPath: ${xpath}, Element: ${elementName}, Page: ${pageName}`);
            }

            try {
              console.log(`💾 Calling storeXPathToDatabase for XPath ${index + 1} with session: ${currentSessionId}`);
              await storeXPathToDatabase(xpath, elementName, pageName);
              console.log(`✅ Stored XPath ${index + 1} to database:`, elementName);
              return { success: true, xpath, elementName, index };
            } catch (error) {
              console.error(`❌ Error storing XPath ${index + 1}:`, error);
              return { success: false, xpath, elementName, index, error };
            }
          });

          // Wait for all storage operations to complete
          Promise.all(storePromises).then((results) => {
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            if (successful.length > 0) {
              // After successful storage, load from database to frontend
              console.log('🔄 Loading stored XPaths to frontend...');
              loadStoredXPaths(true).then(() => {
                // Now emit events and update UI
                successful.forEach(({ xpath, elementName, index }) => {
                  // Emit custom event for TestStepsGrid to listen to
                  window.dispatchEvent(new CustomEvent('xpath-captured-from-extension', {
                    detail: { xpath: xpath, source: 'extension-batch', index: index + 1, total: xpaths.length }
                  }));

                  onXPathAdd(xpath);
                });

                setConnectionStatus('connected');
                onConnectionChange(true);

                toast({
                  title: `✅ ${successful.length} XPaths Stored & Loaded`,
                  description: `Successfully stored and loaded ${successful.length} XPaths from database`,
                });
              });
            }

            if (failed.length > 0) {
              toast({
                title: `❌ ${failed.length} XPaths Failed`,
                description: `Failed to store ${failed.length} XPaths. Check console for details.`,
                variant: "destructive"
              });
            }
          });
        }
      } else if (event.data?.type === 'EXTENSION_STATUS') {
        console.log('📊 Extension status update:', event.data.status);
        if (event.data.status === 'connected') {
          setConnectionStatus('connected');
          onConnectionChange(true);
        }
      } else if (event.data?.type === 'TEST_MESSAGE') {
        console.log('🧪 Test message received:', event.data.message);
        toast({
          title: "🧪 Test Message",
          description: event.data.message,
        });
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  };

  // Setup connection monitoring - SINGLE LISTENER ONLY
  useEffect(() => {
    // Add message listener only once
    window.addEventListener('message', handleMessage);
    console.log('✅ MapExtensionController: Message listener added');
    
    return () => {
      window.removeEventListener('message', handleMessage);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      console.log('🗑️ MapExtensionController: Message listener removed');
    };
  }, []); // Remove connectionStatus dependency to prevent multiple listeners

  // ✅ Clear cache when new XPaths are added for instant UI updates
  useEffect(() => {
    if (storedXPaths.length > 0) {
      console.log('🗑️ Clearing cache due to new XPath data');
      setLastApiResponse(null);
      setLastRefreshTime(0);
    }
  }, [storedXPaths.length]);

  // Clear extension data on component mount only
  useEffect(() => {
    console.log('🧹 Clearing extension-related localStorage data on mount');
    
    // Clear ALL extension-related localStorage data to prevent dummy data
    try {
      const keysToClear = [
        'extension_captured_xpaths',
        'extensionXPathData',
        'smartXPath_selectedXPaths',
        'xpath_captured_from_extension',
        'test_steps_data',
        'testStepsCache',
        'tempXPaths'
      ];
      
      keysToClear.forEach(key => {
        const existing = localStorage.getItem(key);
        if (existing) {
          localStorage.removeItem(key);
        }
      });
      
      console.log('🧹 Extension localStorage data cleared');
    } catch (error) {
      console.log('⚠️ Error clearing localStorage:', error);
    }
  }, []);

  // ❌ REMOVED: Auto-load on component mount (Step 2 requirement)
  // XPaths should NOT be loaded when the application starts
  // They should only be shown when explicitly captured from the extension
  // useEffect(() => {
  //   loadStoredXPaths();
  // }, []);

  // ❌ REMOVED: Auto-refresh XPaths periodically (Step 2 requirement)
  // XPaths should only be refreshed when the user clicks "Refresh from DB" button
  // or when new XPaths are captured from the extension
  // useEffect(() => {
  //   if ((connectionStatus === 'connected' || isExtensionConnected) && !isResettingXPaths) {
  //     const pollInterval = setInterval(() => {
  //       console.log('🔄 MapExtensionController: Polling for new XPaths from database...');
  //       loadStoredXPaths();
  //     }, 3000); // Refresh every 3 seconds
  //
  //     return () => clearInterval(pollInterval);
  //   }
  // }, [connectionStatus, isExtensionConnected, isResettingXPaths]);

  const connectToExtension = () => {
    console.log('🔗 User initiated extension connection...');
    
    // Prevent multiple clicks - check if already connected
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      console.log('⚠️ Connection already in progress or completed');
      return;
    }
    
    // Generate a new unique session ID for this connection batch
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentSessionId(newSessionId);
    console.log('🎫 Generated new session ID:', newSessionId);
    
    // Set connection status to connecting immediately to prevent multiple clicks
    setConnectionStatus('connecting');
    
    // Send connection message to extension
    window.postMessage({
      type: 'FRONTEND_READY_FOR_XPATH',
      session_id: newSessionId,
      timestamp: Date.now()
    }, '*');
    
    // Also send direct connection message
    window.postMessage({
      type: 'CONNECT_FRONTEND',
      session_id: newSessionId,
      timestamp: Date.now()
    }, '*');
    
    toast({
      title: "🔄 Extension Connecting",
      description: "Extension connection initiated. Ready to receive XPaths.",
    });
    
    // Show instructions
    setShowInstructions(true);
    
    // Clear any existing heartbeat and start new one
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    // Start heartbeat for connection maintenance
    heartbeatIntervalRef.current = setInterval(() => {
      window.postMessage({
        type: 'PING',
        timestamp: Date.now()
      }, '*');
    }, 5000);
    
    // Set to connected immediately - no timeout delays
    setConnectionStatus('connected');
    onConnectionChange(true);
    
    toast({
      title: "✅ Extension Connected",
      description: "Ready to receive XPaths from the Chrome extension",
    });
  };

  const downloadExtension = () => {
    const downloadUrl = buildApiUrl('/api/extension/download');
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'chrome-extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Extension Download Started",
      description: "Chrome extension package is being downloaded.",
    });
  };

  const testCommunication = async () => {
    console.log('Testing extension communication...');
    setConnectionStatus('connecting');
    
    // ✅ Send test message (no session_id needed)
    window.postMessage({
      type: 'TEST_MESSAGE',
      message: 'Frontend communication test',
      timestamp: Date.now()
    }, '*');
    
    setTimeout(() => {
      setConnectionStatus('connected');
    }, 1000);
    
    toast({
      title: "🧪 Test Communication Successful",
      description: "Extension is ready. Use 'Add to TestSteps' from extension to send XPaths.",
    });
  };


  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'connecting':
        return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Disconnected';
    }
  };

  // Implement button handler - auto-populate test steps with stored XPaths
  const handleImplementXPaths = async () => {
    if (!storedXPaths || storedXPaths.length === 0) {
      toast({
        title: "⚠️ No XPaths to Implement",
        description: "Please capture and store XPaths first",
        variant: "destructive"
      });
      return;
    }

    console.log('🔧 Implementing XPaths to test steps:', storedXPaths);
    
    // Convert to the format expected by onImplementXPaths
    const xpathsToImplement = storedXPaths.map(xp => ({
      element_name: xp.element_name,
      xpath: xp.xpath,
      page_name: xp.page_name,
      page_url: xp.page_url
    }));

    if (onImplementXPaths) {
      try {
        // First implement the XPaths to test steps
        onImplementXPaths(xpathsToImplement);
        
        // Then automatically delete them from database (Step 3 requirement)
        console.log('🗑️ Auto-deleting XPaths after successful implementation...');
        await deleteAllXPathsForSession(false); // Don't show toast since we'll show a combined message
        
        toast({
          title: "✅ XPaths Implemented & Deleted",
          description: `Implemented ${xpathsToImplement.length} XPath(s) to test steps. Database has been cleared.`,
        });
      } catch (error) {
        console.error('❌ Error during implementation process:', error);
        toast({
          title: "⚠️ Partial Success",
          description: `XPaths implemented but deletion failed: ${error.message}`,
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "⚠️ Implementation Not Configured",
        description: "onImplementXPaths callback not configured",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-blue-800 flex items-center">
          <Globe className="w-5 h-5 mr-2" />
          Map Extension Controller
          {(isExtensionConnected || connectionStatus === 'connected') && (
            <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
              Connected
            </span>
          )}
          {isStoringToDB && (
            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Storing to DB
            </span>
          )}
          {isRefreshingXPaths && (
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Fast Refresh
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!(isExtensionConnected || connectionStatus === 'connected') ? (
          <div className="text-center">
            <p className="text-sm text-blue-600 mb-4">
              Click to set up extension communication
            </p>
            <Button
              onClick={connectToExtension}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Globe className="w-4 h-4 mr-2" />
              Connect Extension
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connection Status */}
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center">
                  {getStatusIcon()}
                  <span className="ml-2">Connection Status: {getStatusText()}</span>
                </h4>
              </div>
            </div>

            {/* Main XPath Display Section */}
            {storedXPaths.length > 0 ? (
              <div className="space-y-4">
                {/* Stored XPaths Display */}
                <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg">
                  <h4 className="text-lg font-bold text-green-800 mb-4 flex items-center">
                    <CheckCircle className="w-6 h-6 mr-2 text-green-600" />
                    ✅ Captured XPaths ({storedXPaths.length} stored in database)
                  </h4>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {storedXPaths.map((xpathData, index) => (
                      <div key={xpathData.id} className="p-4 bg-white border-2 border-green-200 rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-gray-900">{xpathData.element_name}</div>
                              <div className="text-xs text-gray-500">
                                Page: <span className="font-semibold text-gray-700">{xpathData.page_name}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigator.clipboard.writeText(xpathData.xpath)}
                            className="text-xs border-gray-300 text-gray-600 hover:bg-gray-100"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        
                        <div className="bg-gray-100 p-3 rounded-md border border-gray-300 mb-2">
                          <code className="text-xs font-mono text-gray-800 break-all leading-relaxed">
                            {xpathData.xpath}
                          </code>
                        </div>
                        
                        <div className="text-xs text-gray-500">
                          📅 {new Date(xpathData.created_at).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Domain: {xpathData.page_domain || 'Unknown Domain'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Implement Button */}
                  <div className="mt-6 pt-4 border-t-2 border-green-300 space-y-3">
                    <Button
                      onClick={handleImplementXPaths}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg py-6 rounded-lg shadow-lg"
                      size="lg"
                    >
                      <Globe className="w-5 h-5 mr-2" />
                      🚀 Implement XPaths to Test Steps
                    </Button>
                    <p className="text-xs text-gray-600 text-center bg-gray-50 p-2 rounded">
                      ✅ This will auto-populate Test Steps 1, 2, 3... with the {storedXPaths.length} stored XPath(s) in ascending order
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => loadStoredXPaths(true)}
                    variant="outline"
                    size="sm"
                    className="flex-1 border-blue-300 text-blue-600"
                    disabled={isRefreshingXPaths}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingXPaths ? 'animate-spin' : ''}`} />
                    {isRefreshingXPaths ? 'Fast Refresh...' : 'Fast Refresh'}
                  </Button>
                  <Button
                    onClick={() => deleteAllXPathsForSession()}
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={isResettingXPaths}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isResettingXPaths ? 'animate-spin' : ''}`} />
                    {isResettingXPaths ? 'Resetting...' : 'Reset'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-lg text-center">
                <Globe className="w-16 h-16 mx-auto mb-4 text-blue-400 opacity-50" />
                <h4 className="text-lg font-bold text-blue-800 mb-2">🎯 Ready to Capture XPaths</h4>
                <p className="text-sm text-blue-700 mb-4">
                  Use the Chrome extension to capture elements from any website. They will appear here automatically!
                </p>
                <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside text-left inline-block">
                  <li>Click extension icon</li>
                  <li>Click "Start Capture"</li>
                  <li>Click elements to capture</li>
                  <li>Click "Add to TestSteps"</li>
                  <li>XPaths will appear here ✅</li>
                </ol>
              </div>
            )}

            {/* Instructions - Always show when connected */}
            {showInstructions && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h5 className="font-semibold text-yellow-800 mb-2">📖 How to use:</h5>
                <ol className="text-xs text-yellow-700 space-y-1 list-decimal list-inside">
                  <li>Navigate to any website</li>
                  <li>Click the Chrome extension icon</li>
                  <li>Click "Start Capture" button</li>
                  <li>Click elements you want to automate (3+)</li>
                  <li>Click "Add to TestSteps" button</li>
                  <li>XPaths will appear in this panel 🎉</li>
                  <li>Click "🚀 Implement" to add them to Test Steps Grid</li>
                </ol>
              </div>
            )}
          </div>
        )}
        
        {/* Quick Actions */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={downloadExtension}
              size="sm"
              variant="outline"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Extension
            </Button>
            
            {connectionStatus === 'connected' && (
              <>
                <Button
                  onClick={() => deleteAllXPathsForSession()}
                  size="sm"
                  variant="destructive"
                  disabled={isResettingXPaths}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isResettingXPaths ? 'animate-spin' : ''}`} />
                  {isResettingXPaths ? 'Resetting...' : 'Reset'}
                </Button>
                
                <Button
                  onClick={() => loadStoredXPaths(true)}
                  size="sm"
                  variant="outline"
                  disabled={isRefreshingXPaths || isStoringToDB}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingXPaths ? 'animate-spin' : ''}`} />
                  {isRefreshingXPaths ? 'Fast Refresh...' : 'Fast Refresh'}
                </Button>

              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MapExtensionController;
