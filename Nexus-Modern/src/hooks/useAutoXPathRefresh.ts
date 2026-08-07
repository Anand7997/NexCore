import { useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/config/api';

interface TestStep {
  id: number;
  tc_id: string;
  step_no: number;
  test_step_description: string;
  page?: string;
  element_name: string;
  action_type: string;
  xpath: string;
  values: string;
}

interface PageObject {
  page_name: string;
  object_name: string;
  xpath: string;
  display_name: string;
}

interface XPathChangeNotification {
  page_name: string;
  object_name: string;
  old_xpath: string;
  new_xpath: string;
  updated_at: string;
  affected_steps: number[];
}

export const useAutoXPathRefresh = (
  testSteps: TestStep[],
  pageObjects: PageObject[],
  onTestStepsChange: (steps: TestStep[]) => void,
  onNotify?: (notification: XPathChangeNotification) => void,
  onSaveToDatabase?: (steps: TestStep[]) => Promise<void>,
  enablePolling: boolean = false
) => {
  // In-memory refs (no localStorage - state cleared on page refresh)
  const lastSyncTimeRef = useRef<number>(Date.now());
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const testStepXPathMapRef = useRef<Map<string, { id: number; step_no: number }>>(new Map());

  // AUTO-FILL MISSING XPATHS: When pageObjects change, fill in any missing xpaths
  useEffect(() => {
    const updatedSteps = testSteps.map(step => {
      // If xpath is missing but element_name exists, try to fill from pageObjects
      if ((!step.xpath || step.xpath === '') && step.element_name) {
        const matchingObject = pageObjects.find(obj => 
          obj.object_name === step.element_name && 
          (!step.page || obj.page_name === step.page)
        );
        
        if (matchingObject && matchingObject.xpath) {
          console.log(`✨ [XPath Auto-Fill] Step ${step.step_no}: auto-filling xpath for ${step.element_name}`);
          return { ...step, xpath: matchingObject.xpath };
        }
      }
      
      // If xpath has changed in pageObjects, update it
      if (step.xpath && step.element_name) {
        const currentObject = pageObjects.find(obj => 
          obj.object_name === step.element_name && 
          obj.page_name === (step.page || obj.page_name)
        );
        
        if (currentObject && currentObject.xpath !== step.xpath) {
          console.log(`🔄 [XPath Auto-Update] Step ${step.step_no}: updating xpath from ${step.xpath} to ${currentObject.xpath}`);
          return { ...step, xpath: currentObject.xpath };
        }
      }
      
      return step;
    });
    
    // Only update if there were changes
    const hasChanges = updatedSteps.some((step, idx) => 
      step.xpath !== testSteps[idx].xpath
    );
    
    if (hasChanges) {
      console.log('✨ [XPath Auto-Fill] Updating test steps with auto-filled xpaths');
      onTestStepsChange(updatedSteps);
      
      // Auto-save to database when xpaths are auto-filled
      if (onSaveToDatabase) {
        console.log('💾 [XPath Auto-Fill] Saving auto-filled xpaths to database...');
        onSaveToDatabase(updatedSteps).catch(error => {
          console.error('❌ [XPath Auto-Fill] Failed to save to database:', error);
        });
      }
    }
  }, [pageObjects, onTestStepsChange, onSaveToDatabase]);

  // Update the xpath map whenever test steps change
  useEffect(() => {
    const newMap = new Map<string, { id: number; step_no: number }>();
    testSteps.forEach(step => {
      const key = `${step.page || 'unknown'}|${step.element_name}`;
      newMap.set(key, { id: step.id, step_no: step.step_no });
    });
    testStepXPathMapRef.current = newMap;
    
    console.log('🔄 [XPath Refresh] Updated test step map with', testSteps.length, 'steps');
  }, [testSteps]);

  // Poll for changes
  const pollForChanges = useCallback(async () => {
    if (!isPollingRef.current) return;

    try {
      const lastSyncTime = new Date(lastSyncTimeRef.current).toISOString();
      
      console.log('🔍 [XPath Refresh] Polling for changes since:', lastSyncTime);

      const response = await fetch(
        buildApiUrl(`/api/page-objects/changes?since_timestamp=${encodeURIComponent(lastSyncTime)}`)
      );

      if (!response.ok) {
        console.warn('⚠️  [XPath Refresh] Poll failed:', response.status);
        return;
      }

      const data = await response.json();
      lastSyncTimeRef.current = Date.now();

      if (!data.changes || data.changes.length === 0) {
        // Silently pass on no changes
        return;
      }

      console.log('🚨 [XPath Refresh] Found', data.changes.length, 'changes:', data.changes);

      // Build map of changes
      const updates: Record<string, string> = {};
      const changeMap: Record<string, { old_xpath: string; new_xpath: string; updated_at: string }> = {};

      data.changes.forEach((change: any) => {
        const key = `${change.page_name}|${change.object_name}`;
        updates[key] = change.xpath;
        changeMap[key] = {
          old_xpath: change.old_xpath || 'unknown',
          new_xpath: change.xpath,
          updated_at: change.updated_at
        };
        
        console.log(
          `📝 [XPath Refresh] Change:`,
          `${change.page_name}.${change.object_name}`,
          `${change.old_xpath || 'unknown'} → ${change.xpath}`
        );
      });

      // Find affected test steps
      const affectedSteps: TestStep[] = [];
      const affectedStepIds: number[] = [];

      testSteps.forEach(step => {
        const key = `${step.page || 'unknown'}|${step.element_name}`;
        if (updates[key] && updates[key] !== step.xpath) {
          affectedSteps.push(step);
          affectedStepIds.push(step.step_no);
        }
      });

      if (affectedSteps.length === 0) {
        console.log('✅ [XPath Refresh] No affected test steps');
        return;
      }

      console.log(`⚠️  [XPath Refresh] Updating ${affectedSteps.length} steps:`, 
        affectedSteps.map(s => `Step ${s.step_no}`).join(', ')
      );

      // Update test steps
      const updatedSteps = testSteps.map(step => {
        const key = `${step.page || 'unknown'}|${step.element_name}`;
        if (updates[key] && updates[key] !== step.xpath) {
          console.log(`🔄 [XPath Refresh] Updating Step ${step.step_no}: ${step.element_name}`);
          return { ...step, xpath: updates[key] };
        }
        return step;
      });

      onTestStepsChange(updatedSteps);

      // Auto-save to database when xpaths are auto-refreshed
      if (onSaveToDatabase) {
        console.log('💾 [XPath Refresh] Saving auto-refreshed xpaths to database...');
        onSaveToDatabase(updatedSteps).catch(error => {
          console.error('❌ [XPath Refresh] Failed to save to database:', error);
        });
      }

      // Notify about each change
      Object.entries(changeMap).forEach(([key, change]) => {
        const [page, object] = key.split('|');
        const notification: XPathChangeNotification = {
          page_name: page,
          object_name: object,
          old_xpath: change.old_xpath,
          new_xpath: change.new_xpath,
          updated_at: change.updated_at,
          affected_steps: affectedStepIds
        };

        if (onNotify) {
          onNotify(notification);
        }
      });

      console.log(`✅ [XPath Refresh] Updated ${affectedSteps.length} test steps`);

    } catch (error) {
      console.error('❌ [XPath Refresh] Error:', error);
    }
  }, [testSteps, onTestStepsChange, onNotify, onSaveToDatabase]);

  // Start polling only if enabled
  useEffect(() => {
    if (!enablePolling) {
      console.log('🔇 [XPath Refresh] Polling disabled - manual refresh only');
      return;
    }

    isPollingRef.current = true;
    lastSyncTimeRef.current = Date.now();

    console.log('🟢 [XPath Refresh] Starting polling...');

    pollingIntervalRef.current = setInterval(pollForChanges, 3000);

    return () => {
      console.log('🔴 [XPath Refresh] Stopping polling');
      isPollingRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [pollForChanges, enablePolling]);

  return {
    triggerRefresh: () => pollForChanges(),
    stopPolling: () => { isPollingRef.current = false; },
    startPolling: () => { isPollingRef.current = true; }
  };
};

export default useAutoXPathRefresh;
