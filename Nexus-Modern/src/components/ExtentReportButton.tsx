import React from 'react';
import { FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

interface ExtentReportButtonProps {
  className?: string;
  onClick?: () => void;
}

export const ExtentReportButton: React.FC<ExtentReportButtonProps> = ({
  className = "",
  onClick
}) => {
  const { toast } = useToast();

  const handleExtentReport = async () => {
    try {
      toast({
        title: "Loading Extent Report",
        description: "Checking report status...",
      });

      // Check if report is already available
      const statusResponse = await fetch(buildApiUrl('/api/extent/status'));

      if (!statusResponse.ok) {
        throw new Error('Backend not responding');
      }

      const statusResult = await statusResponse.json();

      if (statusResult.report_ready && statusResult.report_url) {
        toast({
          title: "Opening Extent Report",
          description: "Report is ready and opening in new tab",
        });
        window.open(statusResult.report_url, '_blank');
      } else if (statusResult.available) {
        toast({
          title: "Generating Extent Report",
          description: "Test results found, generating report...",
        });

        const generateResponse = await fetch(buildApiUrl('/api/extent/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const generateResult = await generateResponse.json();

        if (generateResult.success) {
          toast({
            title: "Report Generated",
            description: "Extent report opened in new tab",
          });
          window.open(generateResult.report_url, '_blank');
        } else {
          toast({
            title: "Generation Failed",
            description: generateResult.error || "Failed to generate Extent report",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "No Results Available",
          description: "No test results found to generate Extent report",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error handling Extent report:', error);
      toast({
        title: "Error",
        description: "Failed to access Extent report. Please check if the backend is running.",
        variant: "destructive"
      });
    }

    if (onClick) {
      onClick();
    }
  };

  return (
    <button
      onClick={handleExtentReport}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border bg-background hover:text-accent-foreground h-10 px-4 py-2 border-indigo-500/20 text-indigo-600 hover:bg-indigo-50 ${className}`}
    >
      <FileText className="w-4 h-4 mr-2" />
      View Extent Report
    </button>
  );
};

export default ExtentReportButton;
