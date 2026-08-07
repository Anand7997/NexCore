import React from 'react';
import { ChartColumn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

interface AllureReportButtonProps {
  className?: string;
  onClick?: () => void;
}

export const AllureReportButton: React.FC<AllureReportButtonProps> = ({ 
  className = "", 
  onClick 
}) => {
  const { toast } = useToast();

  const handleAllureReport = async () => {
    try {
      // Show loading notification
      toast({
        title: "Loading Allure Report",
        description: "Checking report status...",
      });

      // First check if Allure report is already available
      const statusResponse = await fetch(buildApiUrl('/api/allure/status'));
     
      if (!statusResponse.ok) {
        throw new Error('Backend not responding');
      }
     
      const statusResult = await statusResponse.json();
     
      if (statusResult.report_ready && statusResult.report_url) {
        // Report is already ready, open it directly
        toast({
          title: "Opening Allure Report",
          description: "Report is ready and opening in new tab",
        });
        window.open(statusResult.report_url, '_blank');
      } else if (statusResult.available) {
        // Results are available but report needs to be generated
        toast({
          title: "Generating Allure Report",
          description: "Test results found, generating report...",
        });
       
        const generateResponse = await fetch(buildApiUrl('/api/allure/generate'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
       
        const generateResult = await generateResponse.json();
       
        if (generateResult.success) {
          // Open the newly generated report
          toast({
            title: "Report Generated",
            description: "Allure report opened in new tab",
          });
          window.open(generateResult.report_url, '_blank');
        } else {
          toast({
            title: "Generation Failed",
            description: generateResult.error || "Failed to generate Allure report",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "No Results Available",
          description: "No test results found to generate Allure report",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error handling Allure report:', error);
      toast({
        title: "Error",
        description: "Failed to access Allure report. Please check if the backend is running.",
        variant: "destructive"
      });
    }

    // Call custom onClick if provided
    if (onClick) {
      onClick();
    }
  };

  return (
    <button 
      onClick={handleAllureReport}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border bg-background hover:text-accent-foreground h-10 px-4 py-2 border-purple-500/20 text-purple-600 hover:bg-purple-50 ${className}`}
    >
      <ChartColumn className="w-4 h-4 mr-2" />
      View Allure Report
    </button>
  );
};

export default AllureReportButton;