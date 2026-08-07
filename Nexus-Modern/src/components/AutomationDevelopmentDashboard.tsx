import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Code2, Save, Play, ArrowUp, ArrowDown, ArrowRight, Plus, TestTube, List, Edit, Trash2, FolderPlus, FilePlus, Target, X, AlertTriangle, RefreshCw, Globe, Layers, FileText } from 'lucide-react';
import PhaseStepCard from '@/components/ui/phase-step-card';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/useAuthorization';
import { buildApiUrl } from '@/config/api';
import PageBackButton from '@/components/ui/page-back-button';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Import existing components
import ProjectDashboard from './ProjectDashboard';
import ModulesDashboard from './ModulesDashboard';
import TestCaseDashboard from './TestCaseDashboard';
import TestStepsGrid, { TestStepsGridRef } from './TestStepsGrid';
import MapExtensionController from './MapExtensionController';

interface TestStep {
  id: number;
  tc_id: string;
  step_no: number;
  test_step_description: string;
  page?: string; // New: associated page name
  element_name: string;
  action_type: string;
  xpath: string;
  values: string;
}

type DevelopmentViewType = 'overview' | 'projects' | 'project-list' | 'modules' | 'testcases' | 'steps' | 'createpage';

// Standalone component to avoid state reset on parent re-renders
const CreatePageSectionBlock: React.FC<{
  onBack?: () => void;
  resetKey?: number;
  onObjectUpdated?: (change?: { old_object_name?: string; object_name?: string; xpath?: string; page_name?: string }) => void;
}> = ({ onBack, resetKey, onObjectUpdated }) => {
  const { toast } = useToast();
  const [pageName, setPageName] = useState<string>("");
  const [step, setStep] = useState<1 | 2>(1);
  const [objectName, setObjectName] = useState<string>("");
  const [xpath, setXpath] = useState<string>("");
  const [objects, setObjects] = useState<{ object_name: string; xpath: string }[]>([]);
  const [browserUrl, setBrowserUrl] = useState<string>("");
  const [savedBrowserUrl, setSavedBrowserUrl] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [pages, setPages] = useState<{ id: number; page_name: string; browser_url?: string }[]>([]);
  const [loadingPages, setLoadingPages] = useState<boolean>(false);
  const [existingObjects, setExistingObjects] = useState<{ id: number; object_name: string; xpath: string }[]>([]);
  const [loadingObjects, setLoadingObjects] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<{ object_name: string; xpath: string } | null>(null);
  const [isEditingBrowserUrl, setIsEditingBrowserUrl] = useState<boolean>(false);
  const [editingBrowserUrl, setEditingBrowserUrl] = useState<string>("");
  // removed legacy inline-add flag usage

  // New object creation state (pattern similar to TestStepsGrid)
  const [isAddingNewObject, setIsAddingNewObject] = useState(false);
  const [newObjectData, setNewObjectData] = useState({ object_name: '', xpath: '' });

  // Extension integration state
  const [isExtensionConnected, setIsExtensionConnected] = useState(false);
  const [extensionListener, setExtensionListener] = useState<any>(null);
  const [lastReceivedXPath, setLastReceivedXPath] = useState<string>('');
  const [extensionXPaths, setExtensionXPaths] = useState<Array<{id: number, element_name: string, xpath: string, page_name: string, created_at: string}>>([]);
  const [isLoadingExtensionXPaths, setIsLoadingExtensionXPaths] = useState(false);
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

  const loadPages = async () => {
    try {
      setLoadingPages(true);
      const res = await fetch(buildApiUrl('/api/page-names'));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load pages');
      setPages(data || []);
    } catch (e: any) {
      console.error('Load pages error:', e);
      toast({ title: 'Failed to load pages', description: e?.message, variant: 'destructive' });
    } finally {
      setLoadingPages(false);
    }
  };

  const loadExistingObjects = async (name: string) => {
    try {
      setLoadingObjects(true);
      const res = await fetch(buildApiUrl(`/api/pages/${encodeURIComponent(name)}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load objects');
      setExistingObjects((data || []).map((o: any) => ({ id: o.id, object_name: o.object_name, xpath: o.xpath })));
    } catch (e: any) {
      console.error('Load objects error:', e);
      toast({ title: 'Failed to load objects', description: e?.message, variant: 'destructive' });
      setExistingObjects([]);
    } finally {
      setLoadingObjects(false);
    }
  };

  React.useEffect(() => {
    loadPages();
  }, []);

  // Reset internal state when resetKey changes (to return to step 1 view)
  React.useEffect(() => {
    if (resetKey !== undefined) {
      setStep(1);
      setPageName("");
      setObjects([]);
      setExistingObjects([]);
      setEditingId(null);
      setIsEditingBrowserUrl(false);
      setEditingBrowserUrl("");
    }
  }, [resetKey]);

  const createPage = async () => {
    if (!pageName.trim()) {
      toast({ title: "Validation", description: "Please enter a page name", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(buildApiUrl('/api/page-names'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_name: pageName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create page');
      toast({ title: 'Page Created', description: `"${pageName}" is ready. Click it to add objects.` });
      setPageName("");
      await loadPages();
    } catch (e: any) {
      console.error('Create page error:', e);
      toast({ title: 'Create failed', description: e?.message, variant: 'destructive' });
    }
  };

  const renamePage = async (id: number, current: string) => {
    const newName = window.prompt('Enter new page name', current)?.trim();
    if (!newName || newName === current) return;
    try {
      const res = await fetch(buildApiUrl(`/api/page-names/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_name: newName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to rename page');
      toast({ title: 'Page Renamed', description: `"${current}" -> "${newName}"` });
      await loadPages();
      if (pageName === current) {
        setPageName(newName);
        await loadExistingObjects(newName);
      }
    } catch (e: any) {
      console.error('Rename page error:', e);
      toast({ title: 'Rename failed', description: e?.message, variant: 'destructive' });
    }
  };

  const deletePage = async (id: number, name: string) => {
    if (!window.confirm(`Delete page "${name}" and all its objects?`)) return;
    try {
      const res = await fetch(buildApiUrl(`/api/page-names/${id}`), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete page');
      toast({ title: 'Page Deleted', description: `"${name}" removed with its objects` });
      await loadPages();
      if (pageName === name) {
        resetForm();
      }
    } catch (e: any) {
      console.error('Delete page error:', e);
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    }
  };

  const openObjectsFor = async (name: string) => {
    setPageName(name);
    setStep(2);
    const selectedPage = pages.find((page) => page.page_name === name);
    setSavedBrowserUrl(selectedPage?.browser_url || "");
    setBrowserUrl("");
    setIsEditingBrowserUrl(false);
    setEditingBrowserUrl("");
    // Initialize with 10 blank rows for grid entry
    setObjects(Array.from({ length: 5 }, () => ({ object_name: '', xpath: '' })));
    setEditingId(null);
    await loadExistingObjects(name);
  };

  const addOrUpdateObject = async () => {
    if (!objectName.trim() || !xpath.trim()) {
      toast({ title: "Validation", description: "Enter object name and XPath", variant: "destructive" });
      return;
    }
    // Update existing object
    if (editingId) {
      try {
        const res = await fetch(buildApiUrl(`/api/pages/${editingId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ object_name: objectName.trim(), xpath: xpath.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update object');
        toast({ title: 'Object Updated', description: `${objectName.trim()}` });
        // refresh existing objects
        await loadExistingObjects(pageName);
        onObjectUpdated?.(data);
        setEditingId(null);
        setObjectName('');
        setXpath('');
      } catch (e: any) {
        console.error('Update object error:', e);
        toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
      }
      return;
    }
    // Add to pending list
    setObjects((prev) => [...prev, { object_name: objectName.trim(), xpath: xpath.trim() }]);
    setObjectName("");
    setXpath("");
  };

  const removeObject = (index: number) => {
    setObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const deleteExistingObject = async (id: number) => {
    if (!window.confirm('Delete this object?')) return;
    try {
      const res = await fetch(buildApiUrl(`/api/pages/${id}`), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete object');
      toast({ title: 'Object Deleted' });
      await loadExistingObjects(pageName);
    } catch (e: any) {
      console.error('Delete object error:', e);
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setPageName("");
    setStep(1);
    setObjectName("");
    setXpath("");
    setBrowserUrl("");
    setSavedBrowserUrl("");
    setObjects([]);
    setExistingObjects([]);
    setEditingId(null);
    setIsEditingBrowserUrl(false);
    setEditingBrowserUrl("");
  };

  const updateSavedBrowserUrl = async () => {
    const selectedPage = pages.find((page) => page.page_name === pageName);
    const nextBrowserUrl = editingBrowserUrl.trim();

    if (!selectedPage?.id) {
      toast({ title: 'Update failed', description: 'Page information is missing', variant: 'destructive' });
      return;
    }

    if (!nextBrowserUrl) {
      toast({ title: 'Validation', description: 'Enter a browser URL', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch(buildApiUrl(`/api/page-names/${selectedPage.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_name: pageName,
          browser_url: nextBrowserUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update browser URL');

      setSavedBrowserUrl(nextBrowserUrl);
      setBrowserUrl("");
      setIsEditingBrowserUrl(false);
      setEditingBrowserUrl("");
      await loadPages();
      toast({ title: 'Browser URL Updated', description: nextBrowserUrl });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    }
  };

  // Extension functions
  const loadExtensionXPaths = async () => {
    try {
      setIsLoadingExtensionXPaths(true);
      console.log('Loading unimplemented XPaths from database (sorted by created_at)...');

      const fetchForUser = async (userEmail: string) => {
        const response = await fetch(buildApiUrl('/api/extension-xpaths'), {
          headers: {
            'X-User-Email': userEmail
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to load extension XPaths from database');
        }

        return response.json();
      };

      const currentUserEmail = getCurrentUserEmail();
      let data = await fetchForUser(currentUserEmail);
      let allXPaths = Array.isArray(data) ? data : (data.xpaths || []);

      if (allXPaths.length === 0 && currentUserEmail !== 'extension_user') {
        console.log('No XPaths for logged-in user, retrying with extension_user');
        data = await fetchForUser('extension_user');
        allXPaths = Array.isArray(data) ? data : (data.xpaths || []);
      }

      console.log('Unimplemented XPaths loaded from database:', allXPaths.length);

      if (allXPaths.length > 0) {
        const sortedXPaths = allXPaths.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        console.log('XPaths sorted by created_at');
        setExtensionXPaths(sortedXPaths);
        return sortedXPaths;
      } else {
        console.log('No unimplemented XPaths found in database');
        setExtensionXPaths([]);
        return [];
      }
    } catch (error) {
      console.error('Error loading extension XPaths from database:', error);
      return [];
    } finally {
      setIsLoadingExtensionXPaths(false);
    }
  };

  const setupExtensionListener = () => {
    console.log('Setting up extension listener...');

    const handleXPathReceived = (event: CustomEvent) => {
      console.log('Custom event received:', event);
      const { xpath, source, timestamp } = event.detail;
      console.log('Object Creation: Received XPath from MapExtensionController:', { xpath, source, timestamp });

      if (xpath && typeof xpath === 'string' && xpath.trim().length > 0) {
        console.log('XPath validation passed:', xpath);
        setLastReceivedXPath(xpath);

        // Auto-open the object row so the captured XPath is visible immediately.
        setIsAddingNewObject(true);

        // Auto-populate the new object fields
        setNewObjectData(prev => ({
          ...prev,
          xpath: xpath
        }));

        toast({
          title: "XPath Received from Extension",
          description: `XPath received: ${xpath.substring(0, 50)}...`,
        });
      } else {
        console.warn('XPath validation failed:', { xpath });
        toast({
          title: "Invalid XPath Received",
          description: "Received XPath is invalid or empty",
          variant: "destructive"
        });
      }
    };

    const handleXPathBatchSaved = (event: MessageEvent) => {
      console.log('Window message received:', event);
      if (event.data && event.data.type === 'XPATH_BATCH_SAVED_TO_DATABASE') {
        console.log('Extension XPaths saved to database:', event.data);
        const { count, session_id, timestamp } = event.data;

        // Refresh the extension XPaths data
        loadExtensionXPaths();

        toast({
          title: "XPaths Saved to Database",
          description: `${count} XPaths saved successfully from extension`,
        });
      }
    };

    window.addEventListener('xpath-captured-from-extension', handleXPathReceived as EventListener);
    window.addEventListener('message', handleXPathBatchSaved);
    console.log('Custom event listeners added successfully');

    // Send ready signal
    window.postMessage({
      type: 'OBJECT_CREATION_READY',
      source: 'ObjectCreation',
      timestamp: Date.now()
    }, '*');
    console.log('Object Creation: Ready signal sent');

    setExtensionListener(() => {
      window.removeEventListener('xpath-captured-from-extension', handleXPathReceived as EventListener);
      window.removeEventListener('message', handleXPathBatchSaved);
      console.log('Object Creation: Extension listeners cleaned up');
    });
  };

  const handleImplementXPaths = (xpaths: Array<{element_name: string, xpath: string, page_name: string, page_url?: string}>) => {
    console.log('Implementing XPaths to objects:', xpaths);

    if (!xpaths || xpaths.length === 0) {
      console.warn('No XPaths to implement');
      return;
    }

    const newObjects = xpaths.map((xpathData) => ({
      object_name: xpathData.element_name,
      xpath: xpathData.xpath
    }));

    const capturedUrl = xpaths
      .map((xpathData) => String(xpathData.page_url || '').trim())
      .find((url) => /^https?:\/\//i.test(url));

    console.log('Created new objects from XPaths:', newObjects);

    // Implement directly into the inline grid and close the standalone add-object row.
    setIsAddingNewObject(false);
    setNewObjectData({ object_name: '', xpath: '' });

    setObjects(prev => {
      const updatedRows = prev.map((row) => ({ ...row }));
      const remainingObjects: Array<{ object_name: string; xpath: string }> = [];

      newObjects.forEach((newObject) => {
        const emptyIndex = updatedRows.findIndex((row) => !row.object_name.trim() && !row.xpath.trim());

        if (emptyIndex >= 0) {
          updatedRows[emptyIndex] = newObject;
        } else {
          remainingObjects.push(newObject);
        }
      });

      return [...updatedRows, ...remainingObjects];
    });

    if (capturedUrl) {
      setBrowserUrl(capturedUrl);
    }

    toast({
      title: "XPaths Implemented Successfully",
      description: capturedUrl
        ? `Loaded ${xpaths.length} XPath(s) into object rows and captured the page URL.`
        : `Loaded ${xpaths.length} XPath(s) into object rows`,
    });
  };

  // Setup extension listener when component mounts and Step 2 is shown
  React.useEffect(() => {
    if (step === 2) {
      setupExtensionListener();
    }
    
    return () => {
      if (extensionListener && typeof extensionListener === 'function') {
        extensionListener();
      }
    };
  }, [step]);

  // Save inline grid objects in bulk for the current page
  const saveToDatabase = async () => {
    const trimmedPage = pageName.trim();
    const trimmedBrowserUrl = browserUrl.trim();
    const browserUrlToPersist = trimmedBrowserUrl || savedBrowserUrl.trim();
    const validObjects = (objects || [])
      .map(o => ({ object_name: o.object_name?.trim() || '', xpath: o.xpath?.trim() || '' }))
      .filter(o => o.object_name && o.xpath);

    if (!trimmedPage) {
      toast({ title: 'Validation', description: 'Page name missing', variant: 'destructive' });
      return;
    }
    if (validObjects.length === 0 && !browserUrlToPersist) {
      toast({ title: 'Validation', description: 'Add at least one valid object or a browser URL', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(buildApiUrl('/api/pages/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_name: trimmedPage, browser_url: browserUrlToPersist, objects: validObjects }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');

      const savedCount = Number(data?.inserted_count ?? validObjects.length);
      toast({
        title: 'Saved',
        description: `Saved ${savedCount} object${savedCount === 1 ? '' : 's'} for page "${trimmedPage}"`
      });

      // Refresh existing objects and reset the inline grid to fresh 5 rows
      await loadPages();
      await loadExistingObjects(trimmedPage);
      setSavedBrowserUrl(savedBrowserUrl.trim() || trimmedBrowserUrl);
      setBrowserUrl("");
      setObjects(Array.from({ length: 5 }, () => ({ object_name: '', xpath: '' })));
    } catch (err: any) {
      console.error('Save pages error:', err);
      toast({ title: 'Save failed', description: err?.message || 'Unable to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="automation-development-theme space-y-4">
      {/* Common Back Button */}
      {onBack && (
        <div className="mb-4">
          <Button variant="outline" className="border-gray-200 text-gray-700" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
          </Button>
        </div>
      )}
      
      {/* Step 1: Create Page and Select */}
      {step === 1 && (
        <>
          {/* Create Page Block */}
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300 bg-gradient-to-br from-green-50 to-emerald-100 border-green-200 dark:from-slate-900 dark:to-slate-800 dark:border-emerald-900/60">
            <div className="flex flex-col space-y-1.5 p-6 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                  <FilePlus className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold tracking-tight text-lg text-gray-900">Create Page</h3>
              </div>
            </div>
            <div className="p-6 pt-0">
              <p className="text-gray-600 text-sm mb-4">Create a page first. Then click it to add objects.</p>
              <div className="grid gap-3 max-w-md">
                <div className="grid gap-2">
                  <Label className="text-gray-700">Page Name</Label>
                  <Input
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="e.g., LoginPage"
                    onKeyDown={(e) => { if (e.key === 'Enter') createPage(); }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button className="bg-green-500 hover:bg-green-600" onClick={createPage}>
                    Create Page
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Pages Block */}
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300 bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200 dark:from-slate-900 dark:to-slate-800 dark:border-blue-900/60">
            <div className="flex flex-col space-y-1.5 p-6 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <FolderPlus className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold tracking-tight text-lg text-gray-900">Existing Pages</h3>
              </div>
            </div>
            <div className="p-6 pt-0">
              <p className="text-gray-600 text-sm mb-4">Click a page to start adding objects and XPaths.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {loadingPages && <div className="text-sm text-gray-600">Loading...</div>}
                {!loadingPages && pages.length === 0 && (
                  <div className="text-sm text-gray-600">No pages yet. Create one above.</div>
                )}
                {!loadingPages && pages.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200 hover:border-blue-300 dark:from-slate-900 dark:to-slate-800 dark:border-blue-900/60 dark:hover:border-blue-700/70"
                    onClick={() => openObjectsFor(p.page_name)}
                  >
                    <div className="flex flex-col space-y-1.5 p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
                            <FolderPlus className="w-4 h-4 text-white" />
                          </div>
                          <h4 className="font-semibold tracking-tight text-base text-gray-900">{p.page_name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600 border-blue-200"
                            onClick={(e) => { e.stopPropagation(); renamePage(p.id, p.page_name); }}
                          >
                            <Edit className="w-3 h-3 mr-1" /> Rename
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200"
                            onClick={(e) => { e.stopPropagation(); deletePage(p.id, p.page_name); }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 pt-0">
                      <p className="text-gray-600 text-xs mb-3">Click to manage objects and XPaths</p>
                      <Button className="bg-blue-500 hover:bg-blue-600" size="sm">Manage Objects</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Step 2: Objects */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Extension Controller Card */}
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300 bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200 dark:from-slate-900 dark:to-slate-800 dark:border-cyan-900/60">
            <div className="flex flex-col space-y-1.5 p-6 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold tracking-tight text-lg text-gray-900">Chrome Extension - Capture XPaths</h3>
              </div>
            </div>
            <div className="p-6 pt-0">
              <p className="text-gray-600 text-sm mb-4">Use the Chrome Extension to capture XPaths from elements on your page, then implement them as objects.</p>
              <MapExtensionController
                onXPathAdd={(xpath) => {
                  // Auto-open and populate the new object form when an XPath arrives.
                  setIsAddingNewObject(true);
                  setNewObjectData(prev => ({
                    ...prev,
                    xpath: xpath
                  }));
                }}
                isExtensionConnected={isExtensionConnected}
                onConnectionChange={setIsExtensionConnected}
                onImplementXPaths={handleImplementXPaths}
              />
            </div>
          </div>

          {/* Objects Management Card */}
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300 bg-gradient-to-br from-green-50 to-emerald-100 border-green-200 dark:from-slate-900 dark:to-slate-800 dark:border-emerald-900/60">
            <div className="flex flex-col space-y-1.5 p-6 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                    <FilePlus className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold tracking-tight text-lg text-gray-900">Add Objects for: {pageName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="border-gray-200 text-gray-700" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-6 pt-0 space-y-4">
              <div className="overflow-auto border rounded-md bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-amber-50 text-amber-900">
                    <tr>
                      <th className="text-left p-2 font-medium w-10">#</th>
                      <th className="text-left p-2 font-medium w-64">Object Name</th>
                      <th className="text-left p-2 font-medium">Value / URL</th>
                      <th className="text-left p-2 font-medium w-48">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t bg-amber-50/60">
                      <td className="p-2">1</td>
                      <td className="p-2">
                        <Input
                          value="BROWSER"
                          disabled
                          className="bg-amber-100 font-semibold text-amber-900"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={browserUrl}
                          onChange={(e) => setBrowserUrl(e.target.value)}
                          placeholder={savedBrowserUrl ? "Enter new URL to update saved browser URL" : "Captured application URL will appear here"}
                          className="border-amber-300 focus:border-amber-500"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="border-amber-200 text-amber-700"
                            onClick={() => setBrowserUrl("")}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Clear
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Objects grid: 10 editable rows at a time */}
            <div className="overflow-auto border rounded-md bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left p-2 font-medium w-10">#</th>
                    <th className="text-left p-2 font-medium w-64">Object Name</th>
                    <th className="text-left p-2 font-medium">XPath</th>
                    <th className="text-left p-2 font-medium w-48">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 10-row input grid */}
                  {objects.map((o, idx) => (
                    <tr key={`inline-${idx}`} className="border-t">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">
                        <Input
                          value={o.object_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setObjects(prev => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], object_name: v };
                              return copy;
                            });
                          }}
                          placeholder="e.g., usernameInput"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={o.xpath}
                          onChange={(e) => {
                            const v = e.target.value;
                            setObjects(prev => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], xpath: v };
                              return copy;
                            });
                          }}
                          placeholder="e.g., //input[@id='username']"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button variant="outline" className="text-red-600 border-red-200" onClick={() => removeObject(idx)}>
                            <Trash2 className="w-4 h-4 mr-1" /> Clear
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Trigger row to start adding */}
                  {!isAddingNewObject && (
                    <tr className="border-t bg-gray-50">
                      <td className="p-2" colSpan={4}>
                        <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => setIsAddingNewObject(true)}>
                          <Plus className="w-4 h-4 mr-2" /> Add Object
                        </Button>
                      </td>
                    </tr>
                  )}

                  {/* New object input row */}
                  {isAddingNewObject && (
                    <tr className="border-t bg-blue-50">
                      <td className="p-2">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                          {(existingObjects?.length || 0) + 1}
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          value={newObjectData.object_name}
                          onChange={(e) => setNewObjectData(prev => ({ ...prev, object_name: e.target.value }))}
                          placeholder="e.g., usernameInput *"
                          className="border-blue-300 focus:border-blue-500"
                          autoFocus
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={newObjectData.xpath}
                          onChange={(e) => setNewObjectData(prev => ({ ...prev, xpath: e.target.value }))}
                          placeholder="e.g., //input[@id='username'] *"
                          className="border-blue-300 focus:border-blue-500"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button
                            className="bg-emerald-500 hover:bg-emerald-600"
                            onClick={async () => {
                              const name = newObjectData.object_name.trim();
                              const xp = newObjectData.xpath.trim();
                              if (!name || !xp) {
                                toast({ title: 'Validation', description: 'Both fields are required', variant: 'destructive' });
                                return;
                              }
                              try {
                                const res = await fetch(buildApiUrl('/api/pages'), {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    page_name: pageName,
                                    browser_url: browserUrl.trim() || savedBrowserUrl.trim(),
                                    objects: [{ object_name: name, xpath: xp }]
                                  })
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data?.error || 'Failed to add object');
                                toast({ title: 'Object Added', description: name });
                                setNewObjectData({ object_name: '', xpath: '' });
                                setIsAddingNewObject(false);
                                setSavedBrowserUrl(savedBrowserUrl.trim() || browserUrl.trim());
                                setBrowserUrl("");
                                await loadPages();
                                await loadExistingObjects(pageName);
                              } catch (e:any) {
                                toast({ title: 'Add failed', description: e?.message, variant: 'destructive' });
                              }
                            }}
                          >
                            <Save className="w-4 h-4 mr-1" /> Save
                          </Button>
                          <Button variant="outline" onClick={() => { setIsAddingNewObject(false); setNewObjectData({ object_name: '', xpath: '' }); }}>
                            <X className="w-4 h-4 mr-1" /> Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Existing objects below input grid */}
                  {loadingObjects && (
                    <tr><td className="p-2 text-gray-600" colSpan={4}>Loading existing objects...</td></tr>
                  )}
                  {!loadingObjects && existingObjects.length > 0 && (
                    <tr><td colSpan={4} className="p-2 font-semibold">Existing Objects</td></tr>
                  )}
                  {!loadingObjects && !!savedBrowserUrl && (
                    <>
                      <tr><td colSpan={4} className="p-2 font-semibold">Saved Browser URL</td></tr>
                      <tr className="border-t bg-amber-50">
                        <td className="p-2">1</td>
                        <td className="p-2 font-semibold text-amber-900">BROWSER</td>
                        <td className="p-2 font-mono text-xs break-all">
                          {isEditingBrowserUrl ? (
                            <Input
                              value={editingBrowserUrl}
                              onChange={(e) => setEditingBrowserUrl(e.target.value)}
                              placeholder="https://example.com"
                              className="border-amber-300 focus:border-amber-500"
                              autoFocus
                            />
                          ) : (
                            savedBrowserUrl
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            {isEditingBrowserUrl ? (
                              <>
                                <Button
                                  className="bg-green-500 hover:bg-green-600 text-white"
                                  onClick={updateSavedBrowserUrl}
                                >
                                  <Save className="w-4 h-4 mr-1" /> Update
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setIsEditingBrowserUrl(false);
                                    setEditingBrowserUrl("");
                                  }}
                                >
                                  <X className="w-4 h-4 mr-1" /> Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                className="border-emerald-200 text-emerald-600"
                                onClick={() => {
                                  setEditingBrowserUrl(savedBrowserUrl);
                                  setIsEditingBrowserUrl(true);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-1" /> Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                  {!loadingObjects && existingObjects.map((o, idx) => (
                    <tr key={o.id} className="border-t bg-gray-50">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">
                        {editingId === o.id ? (
                          <Input
                            value={editingValues?.object_name || ''}
                            onChange={(e) => setEditingValues(v => v ? { ...v, object_name: e.target.value } : v)}
                            placeholder="Object name"
                          />
                        ) : (
                          o.object_name
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs break-all">
                        {editingId === o.id ? (
                          <Input
                            value={editingValues?.xpath || ''}
                            onChange={(e) => setEditingValues(v => v ? { ...v, xpath: e.target.value } : v)}
                            placeholder="XPath"
                          />
                        ) : (
                          o.xpath
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          {editingId === o.id ? (
                            <>
                              <Button
                                className="bg-green-500 hover:bg-green-600 text-white"
                                onClick={async () => {
                                  if (!editingValues?.object_name?.trim() || !editingValues?.xpath?.trim()) {
                                    toast({ title: 'Validation', description: 'Enter object name and XPath', variant: 'destructive' });
                                    return;
                                  }
                                  try {
                                    const res = await fetch(buildApiUrl(`/api/pages/${o.id}`), {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ object_name: editingValues.object_name.trim(), xpath: editingValues.xpath.trim() })
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data?.error || 'Failed to update object');
                                    toast({ title: 'Object Updated', description: editingValues.object_name });
                                    await loadExistingObjects(pageName);
                                    setEditingId(null);
                                    setEditingValues(null);
                                    // Trigger refresh of test steps grid
                                    onObjectUpdated?.(data);
                                  } catch (e: any) {
                                    toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
                                  }
                                }}
                              >
                                <Save className="w-4 h-4 mr-1" /> Update
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => { setEditingId(null); setEditingValues(null); }}
                              >
                                <X className="w-4 h-4 mr-1" /> Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              className="border-emerald-200 text-emerald-600"
                              onClick={() => {
                                setEditingId(o.id);
                                setEditingValues({ object_name: o.object_name, xpath: o.xpath });
                              }}
                            >
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className="border-blue-200 text-blue-600"
                            onClick={() => {
                              // find first empty row and fill it with selected existing object to duplicate/edit in grid
                              const emptyIndex = objects.findIndex(row => !row.object_name && !row.xpath);
                              if (emptyIndex !== -1) {
                                setObjects(prev => {
                                  const copy = [...prev];
                                  copy[emptyIndex] = { object_name: o.object_name, xpath: o.xpath };
                                  return copy;
                                });
                              } else {
                                setObjects(prev => [...prev, { object_name: o.object_name, xpath: o.xpath }]);
                              }
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" /> Copy to Grid
                          </Button>
                          <Button variant="outline" className="text-red-600 border-red-200" onClick={() => deleteExistingObject(o.id)}>
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => setObjects(prev => [...prev, ...Array.from({ length: 5 }, () => ({ object_name: '', xpath: '' }))])} className="bg-blue-500 hover:bg-blue-600">
                <Plus className="w-4 h-4 mr-2" /> Add 5 Rows
              </Button>
              <Button disabled={saving} onClick={saveToDatabase} className="bg-green-500 hover:bg-green-600">
                <Plus className="w-4 h-4 mr-2" /> Add
              </Button>
              <Button variant="outline" onClick={resetForm}>Reset</Button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AutomationDevelopmentDashboardProps {
  onBack?: () => void;
  initialView?: DevelopmentViewType;
}

const AutomationDevelopmentDashboard: React.FC<AutomationDevelopmentDashboardProps> = ({ onBack, initialView }) => {
  const [currentView, setCurrentView] = useState<DevelopmentViewType>(initialView || 'overview');

  React.useEffect(() => {
    if (initialView) setCurrentView(initialView);
  }, [initialView]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedModule, setSelectedModule] = useState<any>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<any>(null);
  const [testSteps, setTestSteps] = useState<any[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [testCaseName, setTestCaseName] = useState('');
  const [testCaseDescription, setTestCaseDescription] = useState('');
  const [testCaseOperations, setTestCaseOperations] = useState<any>(null);
  const testStepsGridRef = useRef<TestStepsGridRef>(null);
  const [createPageReset, setCreatePageReset] = useState(0);

  // Auto-save function for XPath refresh
  const handleAutoXPathRefresh = async (steps: TestStep[]) => {
    if (!selectedTestCase || !selectedProject || !selectedModule) {
      console.warn('Cannot auto-save: missing test case, project, or module');
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(selectedTestCase.name)}/bulk`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTestCase.id,
          clear_existing: true, // Clear existing and recreate with updated XPaths
          project_name: selectedProject.name || selectedProject.project_name,
          module_name: selectedModule.name || selectedModule.module_name,
          steps: steps.map((step, idx) => ({
            tc_id: selectedTestCase.name,
            step_no: idx + 1,
            test_step_description: step.test_step_description || '',
            page: (step as any).page || '',
            element_name: step.element_name || '',
            action_type: step.action_type || 'CLICK',
            xpath: step.xpath || '',
            values: (step as any).values || '',
            project_name: selectedProject.name || selectedProject.project_name,
            module_name: selectedModule.name || selectedModule.module_name
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to save steps: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      console.log('Auto-saved test steps to database after XPath refresh');
    } catch (error) {
      console.error('Failed to auto-save test steps:', error);
      throw error; // Re-throw so the hook can handle the error
    }
  };

  // Check authorization for development function
  const { authorized, loading: authLoading, error: authError } = useAuthorization('development');

  const { toast } = useToast();

  // Local component to handle Page creation flow
  const CreatePageSection: React.FC = () => {
    const [pageName, setPageName] = useState<string>("");
    const [step, setStep] = useState<1 | 2>(1);
    const [objectName, setObjectName] = useState<string>("");
    const [xpath, setXpath] = useState<string>("");
    const [objects, setObjects] = useState<{ object_name: string; xpath: string }[]>([]);
    const [saving, setSaving] = useState<boolean>(false);

    const startCreation = () => {
      if (!pageName.trim()) {
        toast({
          title: "Validation",
          description: "Please enter a page name",
          variant: "destructive",
        });
        return;
      }
      setStep(2);
    };

    const addObject = () => {
      if (!objectName.trim() || !xpath.trim()) {
        toast({
          title: "Validation",
          description: "Enter object name and XPath",
          variant: "destructive",
        });
        return;
      }
      setObjects((prev) => [...prev, { object_name: objectName.trim(), xpath: xpath.trim() }]);
      setObjectName("");
      setXpath("");
    };

    const removeObject = (index: number) => {
      setObjects((prev) => prev.filter((_, i) => i !== index));
    };

    const resetForm = () => {
      setPageName("");
      setStep(1);
      setObjectName("");
      setXpath("");
      setObjects([]);
    };

    const saveToDatabase = async () => {
      if (!pageName.trim()) {
        toast({ title: "Validation", description: "Page name missing", variant: "destructive" });
        return;
      }
      if (objects.length === 0) {
        toast({ title: "Validation", description: "Add at least one object", variant: "destructive" });
        return;
      }

      try {
        setSaving(true);
        const res = await fetch(buildApiUrl('/api/pages/bulk'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page_name: pageName.trim(), objects }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to save');

        toast({ title: 'Saved', description: `Saved ${objects.length} objects for page "${pageName}"` });
        resetForm();
      } catch (err: any) {
        console.error('Save pages error:', err);
        toast({ title: 'Save failed', description: err?.message || 'Unable to save', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="space-y-4">
        {step === 1 && (
          <Card className="bg-white backdrop-blur-sm border-gray-200">
            <CardHeader>
              <CardTitle className="text-xl text-gray-900">Create Page</CardTitle>
              <p className="text-gray-600">Enter a page name to start adding objects and XPaths</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 max-w-md">
                <div className="grid gap-2">
                  <Label className="text-gray-700">Page Name</Label>
                  <Input
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="e.g., LoginPage"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button className="bg-purple-500 hover:bg-purple-600" onClick={startCreation}>
                    Continue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Add Objects for: {pageName}</CardTitle>
                <p className="text-gray-600">Provide object names and their XPath locators</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label className="text-gray-700">Object Name</Label>
                    <Input
                      value={objectName}
                      onChange={(e) => setObjectName(e.target.value)}
                      placeholder="e.g., usernameInput"
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-1">
                    <Label className="text-gray-700">XPath</Label>
                    <Input
                      value={xpath}
                      onChange={(e) => setXpath(e.target.value)}
                      placeholder="e.g., //input[@id='username']"
                    />
                  </div>
                </div>
                <div>
                  <Button onClick={addObject} className="bg-blue-500 hover:bg-blue-600">
                    <Plus className="w-4 h-4 mr-2" /> Add Object
                  </Button>
                </div>

                {objects.length > 0 && (
                  <div className="overflow-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left p-2 font-medium">#</th>
                          <th className="text-left p-2 font-medium">Object Name</th>
                          <th className="text-left p-2 font-medium">XPath</th>
                          <th className="text-left p-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {objects.map((o, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{idx + 1}</td>
                            <td className="p-2">{o.object_name}</td>
                            <td className="p-2 font-mono text-xs break-all">{o.xpath}</td>
                            <td className="p-2">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  className="border-blue-200 text-blue-600"
                                  onClick={() => {
                                    setObjectName(o.object_name);
                                    setXpath(o.xpath);
                                    setObjects((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                >
                                  <Edit className="w-4 h-4 mr-1" /> Edit
                                </Button>
                                <Button variant="outline" className="text-red-600 border-red-200" onClick={() => removeObject(idx)}>
                                  <Trash2 className="w-4 h-4 mr-1" /> Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={resetForm}>Reset</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const handleProjectSelect = (project: any) => {
    setSelectedProject(project);
    setCurrentView('modules');
  };

  const handleModuleSelect = (module: any) => {
    setSelectedModule(module);
    setCurrentView('testcases');
  };

  const handleTestCaseSelect = async (testCase: any) => {
    setSelectedTestCase(testCase);
    setTestCaseName(testCase.name);
    setTestCaseDescription(testCase.description || '');
    
    // Automatically load test steps for the selected test case
    try {
      const projectName = selectedProject?.name || selectedProject?.project_name;
      const moduleName = selectedModule?.name || selectedModule?.module_name;
      const encodedTestCaseName = encodeURIComponent(testCase.name);
      const url = projectName && moduleName
        ? buildApiUrl(`/api/teststeps/${encodedTestCaseName}?project_name=${encodeURIComponent(projectName)}&module_name=${encodeURIComponent(moduleName)}`)
        : buildApiUrl(`/api/teststeps/${encodedTestCaseName}`);

      const response = await fetch(url);
      if (response.ok) {
        const steps = await response.json();
        setTestSteps(steps || []);
      } else {
        // If no test steps exist, set empty array
        setTestSteps([]);
      }
    } catch (error) {
      console.error('Error loading test steps:', error);
      setTestSteps([]);
    }
    
    // Create CRUD operations when reaching testcase step
    createCrudOperations(testCase);
    setCurrentView('steps');
  };

  const createCrudOperations = async (testCase: any) => {
    try {
      // Create comprehensive CRUD operations for the selected test case
      const crudOperations = {
        create: {
          endpoint: buildApiUrl('/api/testcases'),
          method: 'POST',
          description: `Create operations for ${testCase.name}`,
          entity: 'testcase'
        },
        read: {
          endpoint: buildApiUrl(`/api/testcases/${testCase.id}`),
          method: 'GET',
          description: `Read operations for ${testCase.name}`,
          entity: 'testcase'
        },
        update: {
          endpoint: buildApiUrl(`/api/testcases/${testCase.id}`),
          method: 'PUT',
          description: `Update operations for ${testCase.name}`,
          entity: 'testcase'
        },
        delete: {
          endpoint: buildApiUrl(`/api/testcases/${testCase.id}`),
          method: 'DELETE',
          description: `Delete operations for ${testCase.name}`,
          entity: 'testcase'
        },
        // Test steps CRUD
        createSteps: {
          endpoint: buildApiUrl(`/api/teststeps/${encodeURIComponent(testCase.name)}/bulk`),
          method: 'POST',
          description: `Create test steps for ${testCase.name}`,
          entity: 'teststeps'
        },
        readSteps: {
          endpoint: buildApiUrl(`/api/teststeps/${encodeURIComponent(testCase.name)}`),
          method: 'GET',
          description: `Read test steps for ${testCase.name}`,
          entity: 'teststeps'
        }
      };

      console.log('CRUD Operations Created for:', testCase.name);
      console.log('Operations Available:', crudOperations);

      // Store CRUD operations in component state for use in steps view
      setTestCaseOperations(crudOperations);

      toast({
        title: "CRUD Operations Created",
        description: `Full CRUD functionality enabled for test case "${testCase.name}"`,
      });

    } catch (error) {
      console.error('Error creating CRUD operations:', error);
      toast({
        title: "CRUD Setup Warning",
        description: "CRUD operations created with limited functionality",
        variant: "destructive"
      });
    }
  };

  const handleSaveTestCase = async () => {
    if (!testCaseName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a test case name",
        variant: "destructive"
      });
      return;
    }

    if (testSteps.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one test step",
        variant: "destructive"
      });
      return;
    }

    try {
      // Prepare payload for create/update
      const testCaseData = {
        name: testCaseName,
        description: testCaseDescription,
        suite_type: 'Development',
        priority: 'Medium',
        status: 'Active',
        project_id: selectedProject?.id || selectedProject?.project_id,
        module_id: selectedModule?.id || selectedModule?.module_id,
        project_name: selectedProject?.name || selectedProject?.project_name,
        module_name: selectedModule?.name || selectedModule?.module_name
      };

      // If a test case is selected (editing), update it; otherwise create a new one
      let testCaseResponse: Response;
      if (selectedTestCase?.id) {
        testCaseResponse = await fetch(buildApiUrl(`/api/testcases/${selectedTestCase.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testCaseData),
        });
      } else {
        testCaseResponse = await fetch(buildApiUrl('/api/testcases'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testCaseData),
        });
      }

      const testCaseJson = await testCaseResponse.json().catch(() => ({}));
      if (!testCaseResponse.ok) {
        throw new Error(testCaseJson?.error || `Failed to ${selectedTestCase?.id ? 'update' : 'save'} test case (${testCaseResponse.status})`);
      }

      // Save test steps (overwrite existing)
      const stepsResponse = await fetch(buildApiUrl(`/api/teststeps/${encodeURIComponent(testCaseName)}/bulk`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedTestCase?.id,
          clear_existing: true,
          project_name: selectedProject?.name || selectedProject?.project_name,
          module_name: selectedModule?.name || selectedModule?.module_name,
          steps: testSteps.map((step, idx) => ({
            tc_id: testCaseName,
            step_no: idx + 1,
            test_step_description: step.test_step_description || '',
            page: (step as any).page || '',
            element_name: step.element_name || '',
            action_type: step.action_type || 'CLICK',
            xpath: step.xpath || '',
            values: (step as any).values || '',
            project_name: selectedProject?.name || selectedProject?.project_name,
            module_name: selectedModule?.name || selectedModule?.module_name
          }))
        }),
      });
      const stepsJson = await stepsResponse.json().catch(() => ({}));
      if (!stepsResponse.ok) {
        throw new Error(stepsJson?.error || `Failed to save test steps (${stepsResponse.status})`);
      }

      setShowSaveDialog(false);

      // Count placeholder tokens configured in test steps (display only).
      // Excel dataset values are mapped at execution time from Excel columns.
      const placeholderPattern = /\{\{[^}]+\}\}/g;
      const placeholderCount = testSteps.reduce((count, step) => {
        const raw = String((step as any).values || '');
        const matches = raw.match(placeholderPattern);
        return count + (matches ? matches.length : 0);
      }, 0);

      toast({
        title: selectedTestCase?.id ? "Test Case Updated" : "Test Case Saved",
        description: `Test case "${testCaseName}" with ${testSteps.length} steps ${placeholderCount > 0 ? `(${placeholderCount} value placeholders configured) ` : ''}${selectedTestCase?.id ? 'updated' : 'saved'} successfully`,
      });

      // Optionally redirect or refresh data
      console.log('Test Case saved/updated successfully:', testCaseData);

    } catch (error) {
      console.error('Error saving test case:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save test case. Please try again.",
        variant: "destructive"
      });
    }
  };



  const renderBreadcrumb = () => {
    const items = [];
    
    items.push({ label: 'Automation Development', onClick: () => setCurrentView('overview') });
    
    if (currentView === 'projects' || selectedProject) {
      items.push({ label: 'Projects', onClick: () => setCurrentView('projects') });
    }
    
    if (selectedProject && (currentView === 'modules' || selectedModule)) {
      items.push({ 
        label: selectedProject.name, 
        onClick: () => setCurrentView('modules') 
      });
    }
    
    if (selectedModule && (currentView === 'testcases' || selectedTestCase)) {
      items.push({ 
        label: selectedModule.name, 
        onClick: () => setCurrentView('testcases') 
      });
    }

    if (selectedTestCase && currentView === 'steps') {
      items.push({ 
        label: selectedTestCase.name, 
        onClick: () => setCurrentView('steps') 
      });
    }

    return (
      <div className="flex items-center space-x-2 text-sm text-gray-600 mb-6">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <button
              onClick={item.onClick}
              className="hover:text-blue-600 hover:underline"
            >
              {item.label}
            </button>
            {index < items.length - 1 && <span>/</span>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderOverview = () => (
    <div className="automation-development-theme space-y-6">
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl text-gray-900">Automation Development</CardTitle>
              <p className="text-gray-600">Build test steps and create automation test cases</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phase sub-steps - same card anatomy as the Home phase cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PhaseStepCard
              icon={FolderPlus}
              title="Projects"
              description="Browse projects from planning and pick the one you build test steps for."
              step="Step 1"
              accent="blue"
              onClick={() => setCurrentView('project-list')}
            />
            <PhaseStepCard
              icon={Layers}
              title="Modules"
              description="Select a module inside the chosen project to scope your test cases."
              step="Step 2"
              accent="emerald"
              disabled={!selectedProject}
              disabledHint="Select a project first"
              onClick={() => setCurrentView('modules')}
            />
            <PhaseStepCard
              icon={FileText}
              title="Test Cases"
              description="Create, read, update and delete test cases for the selected module."
              step="Step 3"
              accent="violet"
              disabled={!selectedModule}
              disabledHint="Select a module first"
              onClick={() => setCurrentView('testcases')}
            />
            <PhaseStepCard
              icon={List}
              title="Test Steps"
              description="Build test steps with full CRUD, XPath locators and API integration."
              step="Step 4"
              accent="purple"
              disabled={!selectedTestCase}
              disabledHint="Select a test case first"
              onClick={() => setCurrentView('steps')}
            />
            <PhaseStepCard
              icon={Globe}
              title="Page Objects"
              description="Create pages and capture element objects with XPath locators."
              step="Tools"
              accent="teal"
              onClick={() => setCurrentView('createpage')}
            />
          </div>

          <div className="text-center py-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Development Workflow with CRUD Operations</h3>
            <p className="text-gray-600 mb-4">
              1. Select Project &amp; Module {'->'} 2. Choose/Create Test Case {'->'} 3. Build Test Steps with Full CRUD {'->'} 4. Save to Planning
            </p>
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">CRUD Operations Available:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><strong>Test Cases:</strong> Create, Read, Update, Delete test cases</div>
                <div><strong>Test Steps:</strong> Full manipulation of test steps with API integration</div>
              </div>
            </div>
            <Button 
              onClick={() => setCurrentView('projects')}
              className="bg-purple-500 hover:bg-purple-600"
            >
              Start Development Process
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return renderOverview();
      case 'projects':
        return (
          <div className="space-y-4">
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Automation Development</CardTitle>
                <p className="text-gray-600">Choose an action to proceed</p>
              </CardHeader>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <PhaseStepCard
                icon={FolderPlus}
                title="Projects"
                description={`Browse projects from planning and follow the flow: Project ${'->'} Modules ${'->'} Test Cases ${'->'} Test Steps`}
                step="Step 1"
                accent="blue"
                onClick={() => setCurrentView('project-list')}
              />

              <PhaseStepCard
                icon={FilePlus}
                title="Create Page"
                description="Create a new page and add objects with XPath locators, then save to database."
                step="Tools"
                accent="emerald"
                onClick={() => setCurrentView('createpage')}
              />
            </div>
          </div>
        );
      case 'createpage':
        return (
          <div className="space-y-4">
            <CreatePageSectionBlock
              onBack={() => {
                setCreatePageReset((n) => n + 1);
                setCurrentView('projects');
              }}
              resetKey={createPageReset}
              onObjectUpdated={(change) => {
                // Trigger XPath refresh in test steps grid when page object is updated
                testStepsGridRef.current?.triggerXPathRefresh(change);
              }}
            />
          </div>
        );
      case 'project-list':
        return (
          <div className="space-y-4">
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Select Project</CardTitle>
                <p className="text-gray-600">Choose a project to access its modules for test step creation</p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-700 text-sm">
                    <strong>Read-Only Mode:</strong> Projects and modules cannot be created, edited, or deleted in automation development.
                    Use the planning phase for project and module management.
                  </p>
                </div>
              </CardHeader>
            </Card>
            <ProjectDashboard 
              onProjectSelect={handleProjectSelect}
              onBack={() => setCurrentView('projects')}
              showBackButton={true}
              readOnlyMode={true}
            />
          </div>
        );
      case 'modules':
        return (
          <div className="space-y-4">
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Select Module</CardTitle>
                <p className="text-gray-600">Choose a module from {selectedProject?.name} to create test steps</p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-700 text-sm">
                    <strong>Read-Only Mode:</strong> Modules cannot be created, edited, or deleted in automation development. 
                    Use the planning phase for module management.
                  </p>
                </div>
              </CardHeader>
            </Card>
            <ModulesDashboard 
              selectedProject={selectedProject}
              onModuleSelect={handleModuleSelect}
              onBack={() => setCurrentView('project-list')}
              readOnlyMode={true} // Show modules from planning phase
            />
          </div>
        );
      case 'testcases':
        return (
          <div className="space-y-4">
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Select or Create Test Case</CardTitle>
                <p className="text-gray-600">Choose an existing test case to add steps to, or create a new one</p>
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-sm">
                    <strong>Full CRUD Mode:</strong> Test cases and steps can be fully created, modified, and deleted. All changes are saved to the development phase and synced to planning.
                  </p>
                </div>
              </CardHeader>
            </Card>
            <TestCaseDashboard 
              selectedProject={selectedProject}
              selectedModule={selectedModule}
              onTestCaseSelect={handleTestCaseSelect}
              onBack={() => setCurrentView('modules')}
              onNext={() => setCurrentView('steps')}
              readOnlyMode={false} // Allow creating new test cases in development
              developmentMode={false} // DISABLE development mode to allow full CRUD operations
            />
          </div>
        );
      case 'steps':
        return (
          <div className="space-y-4">
            {/* Header */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-gray-900">
                      Test Steps - {selectedTestCase?.name || 'New Test Case'}
                    </CardTitle>

                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setCurrentView('testcases')} 
                    className="border-gray-200 text-gray-600"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Test Cases
                  </Button>
                </div>
              </CardHeader>
            </Card>







            {/* Test Steps Grid */}
            <TestStepsGrid
              ref={testStepsGridRef}
              selectedProject={selectedProject}
              selectedModule={selectedModule}
              testSteps={testSteps}
              onTestStepsChange={setTestSteps}
              readOnlyMode={false}
              onAutoXPathRefresh={handleAutoXPathRefresh}
              testCaseName={selectedTestCase?.name}
            />

            {/* Bottom Action Buttons */}
            <Card className="bg-white backdrop-blur-sm border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-end">
                  <div className="flex items-center space-x-3">
                    <Button 
                      onClick={() => {
                        // Create first test step with enhanced data
                        const newStep = {
                          id: Date.now() + Math.random(),
                          tc_id: selectedTestCase?.name || 'TC001',
                          step_no: testSteps.length + 1,
                          test_step_description: `Step ${testSteps.length + 1}: `,
                          element_name: '',
                          action_type: 'CLICK',
                          xpath: '',
                          values: ''
                        };
                        const updatedSteps = [...testSteps, newStep];
                        setTestSteps(updatedSteps);
                        
                        toast({
                          title: "Test Step Created",
                          description: `Step ${newStep.step_no} added to "${selectedTestCase?.name || 'test case'}"`,
                        });
                      }}
                      className="bg-blue-500 hover:bg-blue-600"
                      disabled={!selectedTestCase}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Test Steps
                    </Button>

                    {/* <Button 
                      onClick={() => {
                        testStepsGridRef.current?.addNewStep();
                      }}
                      className="bg-green-500 hover:bg-green-600"
                      disabled={!selectedTestCase}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Test Step
                    </Button> */}
                    
                    <Button 
                      onClick={() => setShowSaveDialog(true)}
                      className="bg-purple-500 hover:bg-purple-600"
                      disabled={testSteps.length === 0}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Test Steps
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Dialog */}
            {showSaveDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <Card className="w-96">
                  <CardHeader>
                    <CardTitle>Save Test Case</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Test Case Name
                      </label>
                      <input
                        type="text"
                        value={testCaseName}
                        onChange={(e) => setTestCaseName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Enter test case name"
                      />
                    </div>
                    <div className="text-sm text-gray-600">
                      <p><strong>Project:</strong> {selectedProject?.name || selectedProject?.project_name}</p>
                      <p><strong>Module:</strong> {selectedModule?.name || selectedModule?.module_name}</p>
                      <p><strong>Test Steps:</strong> {testSteps.length}</p>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowSaveDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSaveTestCase}
                        className="bg-purple-500 hover:bg-purple-600"
                      >
                        Save Test Case
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}


          </div>
        );
      default:
        return renderOverview();
    }
  };

  // Show loading while checking authorization
  if (authLoading) {
    return (
      <Card className="bg-white backdrop-blur-sm border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
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
            <p className="text-gray-600">You are not allowed to access this function.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackButton onClick={onBack} label="Back to Home" />

      {/* Header */}
      <div className="flex items-center justify-between">
        {renderBreadcrumb()}
        <div />
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
};

export default AutomationDevelopmentDashboard;
