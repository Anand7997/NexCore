import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageBackButtonProps {
  onClick?: () => void;
  label?: string;
  className?: string;
  buttonClassName?: string;
}

const PageBackButton: React.FC<PageBackButtonProps> = ({
  onClick,
  label = 'Back',
  className,
  buttonClassName,
}) => {
  if (!onClick) {
    return null;
  }

  return (
    <div className={cn('flex justify-start', className)}>
      <Button
        variant="outline"
        onClick={onClick}
        className={cn('border-gray-200 text-gray-600', buttonClassName)}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {label}
      </Button>
    </div>
  );
};

export default PageBackButton;