import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Monitor as MonitorIcon, Video, VideoOff, Play, Settings, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/useAuthorization';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

interface MonitorProps {
  onBack?: () => void;
}

interface StreamingSession {
  session_id: string;
  session_name: string;
  created_at: string;
  active_clients: number;
  streaming_active: boolean;
  remote_viewing_enabled: boolean;
  stream_url?: string;
  novnc_url?: string;
  execution_id?: string;
  execution_mode?: 'local' | 'server';
  testcase_name?: string;
  viewer_count?: number;
}

interface IsolatedSession {
  session_id: string;
  test_name: string;
  novnc_url: string;
  display_id: number;
  vnc_port: number;
  novnc_port: number;
  start_time: string;
}

interface MonitorDashboardData {
  active_sessions: StreamingSession[];
  isolated_sessions: IsolatedSession[];
  total_active_streams: number;
}

interface RecordedVideo {
  id: string;
  execution_id: string;
  session_name: string;
  recorded_at: string;
  duration: string;
  video_url: string;
  thumbnail_url?: string;
}

const Monitor: React.FC<MonitorProps> = ({ onBack }) => {
  const [recordedVideos, setRecordedVideos] = useState<RecordedVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);

  // Check authorization for test-lab function
  const { authorized, loading: authLoading, error: authError } = useAuthorization('test-lab');

  const { toast } = useToast();

  // Load recorded videos on component mount
  useEffect(() => {
    if (authorized) {
      loadRecordedVideos();
    }
  }, [authorized]);

  const loadRecordedVideos = async () => {
    setIsLoadingVideos(true);
    try {
      const response = await fetch(buildApiUrl('/api/monitor/recorded-videos'));
      if (response.ok) {
        const videos = await response.json();
        setRecordedVideos(videos);
      }
    } catch (error) {
      console.error('Error loading recorded videos:', error);
    } finally {
      setIsLoadingVideos(false);
    }
  };




  // Show loading while checking authorization
  if (authLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            <span>Checking authorization...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error if authorization check failed
  if (authError) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">Error checking authorization: {authError}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show access denied if not authorized
  if (!authorized) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You are not allowed to access the Live Monitor function.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Main Menu" />

      {/* Header */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                <MonitorIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gray-900">Recorded Videos</CardTitle>
                <p className="text-gray-600">View recorded videos from completed test executions</p>
              </div>
            </div>
            <div />
          </div>
        </CardHeader>
      </Card>


      {/* Recorded Videos Section */}
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Recorded Videos from noVNC Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingVideos ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading recorded videos...</p>
            </div>
          ) : recordedVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordedVideos.map((video) => (
                <div key={video.id} className="border rounded-lg overflow-hidden bg-gray-50">
                  <div className="aspect-video bg-black flex items-center justify-center">
                    {video.thumbnail_url ? (
                      <img
                        src={video.thumbnail_url}
                        alt={`Thumbnail for ${video.session_name}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Video className="w-12 h-12 text-gray-400" />
                    )}
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{video.session_name}</h4>
                    <p className="text-sm text-gray-600 mb-2">
                      Execution: {video.execution_id.slice(0, 8)}...
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                      <span>{new Date(video.recorded_at).toLocaleDateString()}</span>
                      <span>{video.duration}</span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(video.video_url, '_blank')}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Watch Recording
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <VideoOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Recorded Videos</h3>
              <p className="text-gray-600">
                Recorded videos from noVNC sessions will appear here after server executions complete.
              </p>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Instructions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <Settings className="w-6 h-6 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Recorded Videos Dashboard</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Recorded Videos:</strong> View all recorded videos from completed test executions</li>
                <li>• <strong>Execution History:</strong> Access videos organized by execution ID and session name</li>
                <li>• <strong>Video Playback:</strong> Click "Watch Recording" to view any recorded test execution</li>
                <li>• <strong>Duration & Timestamps:</strong> See when each recording was made and how long it lasted</li>
                <li>• <strong>Thumbnails:</strong> Preview images help identify specific test executions</li>
                <li>• <strong>Full Resolution:</strong> Videos are recorded in high quality for detailed analysis</li>
                <li>• <strong>Automatic Recording:</strong> Videos are automatically saved after server test executions</li>
                <li>• <strong>Storage Management:</strong> Videos are organized and easily accessible for review</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Monitor;
