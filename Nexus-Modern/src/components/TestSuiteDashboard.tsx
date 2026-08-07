import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TestTube, Zap, Shield, Layers } from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

interface TestSuite {
    suite_type: 'smoke' | 'sanity' | 'regression';
    suite_name: string;
    description: string;
}

interface TestSuiteDashboardProps {
    selectedModule: any;
    onNext: () => void;
    onBack: () => void;
    onSuiteSelect: (suite: TestSuite) => void;
}

const TestSuiteDashboard: React.FC<TestSuiteDashboardProps> = ({
    selectedModule,
    onNext,
    onBack,
    onSuiteSelect
}) => {
    const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null);
    const { toast } = useToast();

    // Predefined test suites
    const predefinedSuites: TestSuite[] = [
        {
            suite_type: 'smoke',
            suite_name: 'Smoke Suite',
            description: 'Quick validation of core functionality to ensure basic features work'
        },
        {
            suite_type: 'sanity',
            suite_name: 'Sanity Suite',
            description: 'Narrow regression testing after minor changes to verify specific functionality'
        },
        {
            suite_type: 'regression',
            suite_name: 'Regression Suite',
            description: 'Comprehensive testing of entire application to ensure no existing functionality is broken'
        }
    ];

    const suiteTypeConfig = {
        smoke: {
            icon: Zap,
            color: 'from-yellow-500 to-orange-500',
            bgColor: 'bg-yellow-50',
            borderColor: 'border-yellow-200',
            textColor: 'text-yellow-700'
        },
        sanity: {
            icon: Shield,
            color: 'from-green-500 to-emerald-500',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            textColor: 'text-green-700'
        },
        regression: {
            icon: Layers,
            color: 'from-purple-500 to-pink-500',
            bgColor: 'bg-purple-50',
            borderColor: 'border-purple-200',
            textColor: 'text-purple-700'
        }
    };

    const handleSuiteSelect = (suite: TestSuite) => {
        setSelectedSuite(suite);
        onSuiteSelect(suite);
    };

    const handleNext = () => {
        if (!selectedSuite) {
            toast({
                title: "Selection Required",
                description: "Please select a test suite to proceed",
                variant: "destructive"
            });
            return;
        }
        onNext();
    };

    if (!selectedModule) {
        return (
            <div className="text-center py-8">
                <TestTube className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Please select a module first</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageBackButton onClick={onBack} label="Back to Modules" />

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
                        <TestTube className="text-blue-500" />
                        <span>Test Suites</span>
                    </h2>
                    <p className="text-gray-600 mt-1">
                        Module: <span className="font-medium text-blue-600">{selectedModule.module_name}</span>
                    </p>
                    <p className="text-sm text-gray-500 mt-2">Select a test suite type to proceed with test case creation</p>
                </div>
                <div />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {predefinedSuites.map((suite) => {
                    const config = suiteTypeConfig[suite.suite_type];
                    const Icon = config.icon;

                    return (
                        <Card
                            key={suite.suite_type}
                            className={`cursor-pointer transition-all duration-200 hover:shadow-lg transform hover:scale-105 ${selectedSuite?.suite_type === suite.suite_type
                                    ? `ring-4 ring-blue-500 ${config.bgColor} shadow-xl scale-105`
                                    : `hover:border-blue-300 ${config.bgColor} ${config.borderColor} border-2`
                                }`}
                            onClick={() => handleSuiteSelect(suite)}
                        >
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-center mb-4">
                                    <div className={`p-4 rounded-2xl bg-gradient-to-r ${config.color} shadow-lg`}>
                                        <Icon className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <CardTitle className="text-xl text-center">
                                    <span className={`${config.textColor} font-bold`}>{suite.suite_name}</span>
                                </CardTitle>
                                <div className={`mx-auto px-3 py-1 text-xs rounded-full ${config.textColor} ${config.bgColor} border ${config.borderColor} capitalize text-center`}>
                                    {suite.suite_type} Testing
                                </div>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {suite.description}
                                </p>
                                {selectedSuite?.suite_type === suite.suite_type && (
                                    <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                                        <p className="text-blue-700 text-sm font-medium">✓ Selected</p>
                                        <p className="text-blue-600 text-xs mt-1">Ready to create test cases</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="flex justify-end pt-6">
                <Button
                    onClick={handleNext}
                    disabled={!selectedSuite}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                    Next: Test Cases →
                </Button>
            </div>
        </div>
    );
};

export default TestSuiteDashboard;
