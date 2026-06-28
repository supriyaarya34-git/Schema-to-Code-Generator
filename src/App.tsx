import React, { useState, useEffect } from 'react';
import { 
  Database, 
  FileCode, 
  Code2, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  RefreshCw, 
  X, 
  Layers, 
  Cpu, 
  AlertCircle,
  Code,
  FileSpreadsheet
} from 'lucide-react';

// Interfaces for parser
interface Column {
  name: string;
  type: string;
  length?: string;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
}

// Default Schema Templates
const SAMPLE_SCHEMAS = {
  assetLocation: `CREATE TABLE [dbo].[tbl_Asset_Location](
	[Asset_Location_ID] [int] PRIMARY KEY IDENTITY(1,1) NOT NULL,
	[Asset_Location_Name] [varchar](100) NULL,
	[IsDeleted] [bit] NULL,
	[CreatedBy] [int] NULL,
	[CreatedOn] [datetime] NULL,
	[ModifiedBy] [int] NULL,
	[ModifiedOn] [datetime] NULL,
	[CompanyID] [int] NULL,
	[IsDefault] [bit] NULL
)`,
  machineType: `CREATE TABLE [dbo].[tbl_Machine_Type](
	[Machine_Type_ID] [int] PRIMARY KEY IDENTITY(1,1) NOT NULL,
	[Machine_Type_Name] [varchar](100) NULL,
	[Description] [varchar](500) NULL,
	[Machine_Code] [varchar](50) NULL,
	[IsDeleted] [bit] NULL,
	[CreatedBy] [int] NULL,
	[CreatedOn] [datetime] NULL,
	[ModifiedBy] [int] NULL,
	[ModifiedOn] [datetime] NULL,
	[CompanyID] [int] NULL
)`,
  departmentMaster: `CREATE TABLE [dbo].[tbl_Department_Master](
	[Department_ID] [int] PRIMARY KEY IDENTITY(1,1) NOT NULL,
	[Department_Name] [varchar](150) NULL,
	[Department_Code] [varchar](30) NULL,
	[Cost_Center] [varchar](50) NULL,
	[IsDeleted] [bit] NULL,
	[CreatedBy] [int] NULL,
	[CreatedOn] [datetime] NULL,
	[ModifiedBy] [int] NULL,
	[ModifiedOn] [datetime] NULL,
	[CompanyID] [int] NULL,
	[IsDefault] [bit] NULL
)`
};

export default function App() {
  const [schemaInput, setSchemaInput] = useState(SAMPLE_SCHEMAS.assetLocation);
  const [activeTab, setActiveTab] = useState<'sp' | 'xml' | 'datamanager' | 'model'>('sp');
  const [copied, setCopied] = useState(false);
  
  // Custom URL slug and system-specific inputs
  const [customSlug, setCustomSlug] = useState('');
  
  // AI Refinement states
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [customizedCodes, setCustomizedCodes] = useState<Record<string, string>>({});
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  // Parse SQL Table details
  const [tableName, setTableName] = useState('tbl_Asset_Location');
  const [columns, setColumns] = useState<Column[]>([]);

  useEffect(() => {
    // Parser logic
    try {
      // Extract table name
      const nameMatch = schemaInput.match(/CREATE\s+TABLE\s+(?:\[?dbo\]?\.\[?)?\[?(\w+)\]?/i);
      const parsedTableName = nameMatch ? nameMatch[1] : 'tbl_Asset_Location';
      setTableName(parsedTableName);

      // Extract columns inside outer parentheses
      const firstOpen = schemaInput.indexOf("(");
      const lastClose = schemaInput.lastIndexOf(")");
      if (firstOpen !== -1 && lastClose !== -1) {
        const body = schemaInput.substring(firstOpen + 1, lastClose);
        const lines = body.split('\n');
        const parsedColumns: Column[] = [];

        for (let rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('--') || line.startsWith('CONSTRAINT') || line.startsWith('PRIMARY KEY') || line.startsWith('KEY ')) {
            continue;
          }

          // Match column name and type
          // E.g., [Asset_Location_ID] [int] PRIMARY KEY IDENTITY(1,1) NOT NULL
          // E.g., [Asset_Location_Name] [varchar](100) NULL
          const colMatch = line.match(/^\[?(\w+)\]?\s+\[?(\w+)\]?(?:\s*\(\s*([\w,]+|\w+\s*\w+|\s*max\s*)\s*\))?/i);
          if (colMatch) {
            const colName = colMatch[1];
            const colType = colMatch[2].toLowerCase();
            const colLength = colMatch[3] || undefined;

            const isIdentity = /IDENTITY/i.test(line);
            const isPrimaryKey = /PRIMARY KEY/i.test(line);
            const isNullable = !/NOT NULL/i.test(line);

            parsedColumns.push({
              name: colName,
              type: colType,
              length: colLength,
              isNullable,
              isIdentity,
              isPrimaryKey
            });
          }
        }
        setColumns(parsedColumns);
      }
    } catch (e) {
      console.error("SQL Parsing failed, falling back to defaults", e);
    }
  }, [schemaInput]);

  // Derived properties for template generation
  const cleanTableName = tableName.replace(/^tbl_/i, '');
  const baseName = cleanTableName; // e.g. Asset_Location
  
  // PascalCase e.g., AssetLocation
  const pascalCaseName = cleanTableName
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');

  // Auto URL slug e.g. settings/asset/location
  const autoUrlSlug = 'settings/' + baseName.toLowerCase().replace(/_/g, '/');
  const urlSlug = customSlug || autoUrlSlug;

  // Identify column roles
  const pkColumn = columns.find(c => c.isPrimaryKey) || 
                   columns.find(c => c.name.toLowerCase().endsWith('_id')) || 
                   columns[0] || { name: `${baseName}_ID`, type: 'int', isNullable: false, isIdentity: true, isPrimaryKey: true };

  const nameColumn = columns.find(c => c.name.toLowerCase().endsWith('_name') || c.name.toLowerCase().includes('name')) || 
                     columns.find(c => c.type.includes('varchar') || c.type.includes('nvarchar')) || 
                     columns[1] || columns[0] || { name: `${baseName}_Name`, type: 'varchar', length: '100', isNullable: true, isIdentity: false, isPrimaryKey: false };

  const hasIsDefault = columns.some(c => c.name.toLowerCase() === 'isdefault');

  const auditNames = ['isdeleted', 'createdby', 'createdon', 'modifiedby', 'modifiedon', 'companyid', 'isdefault'];
  const customColumns = columns.filter(c => 
    c.name !== pkColumn.name && 
    c.name !== nameColumn.name && 
    !auditNames.includes(c.name.toLowerCase())
  );

  // 1. Generate Stored Procedure (SP) Code
  const generateSpCode = () => {
    return `USE [DbSquad1AllClientDev]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[usp_Process_${baseName}] (      
 @Action CHAR(5) = 'S'      
 ,@IsDeleted BIT = 0      
 ,@UserID INT      
 ,@ModifiedOn VARCHAR(200) = NULL      
 ,@${nameColumn.name} ${nameColumn.type.toUpperCase()}${nameColumn.length ? `(${nameColumn.length})` : ''} = NULL      
 ,@${pkColumn.name} INT = NULL      
 ,@CompanyID INT = NULL      
${customColumns.map(col => ` ,@${col.name} ${col.type.toUpperCase()}${col.length ? `(${col.length})` : ''} = NULL`).map(line => line).join('\n')}${customColumns.length > 0 ? '\n' : ''} ,@XmlString TEXT = NULL      
 )      
AS      
BEGIN      
 SET NOCOUNT ON;      
      
 DECLARE @Cnt INT      
      
 IF @Action = 'S'      --for listview
 BEGIN      
  SELECT [${pkColumn.name}]      
   ,[${nameColumn.name}]      
${customColumns.map(col => `   ,C.[${col.name}]`).join('\n')}${customColumns.length > 0 ? '\n' : ''}   ,C.[IsDeleted]      
   ,C.[CreatedOn]      
   ,C.[CreatedBy]      
   ,ISNULL(UC.Employee_Name, '') AS [Creator]      
   ,C.[ModifiedBy]      
   ,C.[ModifiedOn]      
   ,ISNULL(UM.Employee_Name, '') AS [Modifier]      
   ${hasIsDefault ? ',C.IsDefault' : ''}      
  FROM [${tableName}] C WITH (NOLOCK)      
  INNER JOIN [tbl_Users] UC WITH (NOLOCK) ON UC.UserID = C.CreatedBy      
  INNER JOIN [tbl_Users] UM WITH (NOLOCK) ON UM.UserID = C.ModifiedBy      
  WHERE C.CompanyID = @CompanyID      
  ORDER BY CreatedOn DESC      
 END      
 ELSE IF @Action = 'I'    -- to insert  
 BEGIN      
  IF dbo.fn_Auth_user_for_manage('${urlSlug}', @UserID) = 1      
  BEGIN      
   ${hasIsDefault ? `DECLARE @count INT;      
      
   SELECT @count = count(*)      
   FROM [${tableName}]      
   WHERE CompanyID = @CompanyID      
    AND IsDefault = 1      ` : ''}
      
   SET @${nameColumn.name} = dbo.fn_strip_spaces(@${nameColumn.name})      
      
   SELECT @Cnt = Count(*)      
   FROM [${tableName}] WITH (NOLOCK)      
   WHERE LOWER(LTRIM(RTRIM(dbo.fn_strip_spaces(${nameColumn.name})))) = LOWER(LTRIM(RTRIM(@${nameColumn.name})))      
    AND CompanyID = @CompanyID      
      
   IF @Cnt = 0      
   BEGIN      
    BEGIN TRY      
     INSERT INTO [${tableName}] (      
      [${nameColumn.name}]      
${customColumns.map(col => `      ,[${col.name}]`).join('\n')}${customColumns.length > 0 ? '\n' : ''}      ,[IsDeleted]      
      ,[CreatedOn]      
      ,[CreatedBy]      
      ,[ModifiedBy]      
      ,[ModifiedOn]      
      ,[CompanyID]      
      )      
     VALUES (      
      @${nameColumn.name}      
${customColumns.map(col => `      ,@${col.name}`).join('\n')}${customColumns.length > 0 ? '\n' : ''}      ,@IsDeleted      
      ,dbo.GetCurrentDate()      
      ,@UserID      
      ,@UserID      
      ,dbo.GetCurrentDate()      
      ,@CompanyID      
      )      
      
     DECLARE @NewID INT      
      
     SET @NewID = SCOPE_IDENTITY()      
      
     ${hasIsDefault ? `IF @count = 0      
     BEGIN      
      UPDATE [${tableName}]      
      SET IsDefault = 1      
      WHERE ${pkColumn.name} = @NewID      
     END      ` : ''}
      
     SELECT @NewID      
      ,'Successful Insert' AS [Status]      
    END TRY      
      
    BEGIN CATCH      
     EXEC [LogError]      
      
     SELECT 'Error in Insert' AS [Status]      
    END CATCH      
   END      
   ELSE      
    SELECT 'Duplicate Insert' AS [Status]      
  END      
  ELSE      
  BEGIN      
   SELECT 'Unauthorised Access' AS [Status]      
  END      
 END      
 ELSE IF @Action = 'U'      -- to update 
 BEGIN      
  IF dbo.fn_Auth_user_for_manage('${urlSlug}', @UserID) = 1      
  BEGIN      
   SELECT @Cnt = Count(*)      
   FROM [${tableName}] WITH (NOLOCK)      
   WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
    AND ${pkColumn.name} = @${pkColumn.name}      
      
   IF @Cnt > 0      
   BEGIN      
    SELECT @Cnt = Count(*)      
    FROM [${tableName}] WITH (NOLOCK)      
    WHERE ${nameColumn.name} = @${nameColumn.name}      
     AND ${pkColumn.name} <> @${pkColumn.name}      
      
    IF @Cnt = 0      
    BEGIN      
     BEGIN TRY      
      UPDATE [${tableName}]      
      SET [IsDeleted] = @IsDeleted      
       ,[ModifiedBy] = @UserID      
       ,[ModifiedOn] = dbo.GetCurrentDate()      
       ,${nameColumn.name} = @${nameColumn.name}      
${customColumns.map(col => `       ,${col.name} = @${col.name}`).join('\n')}      
      WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
       AND ${pkColumn.name} = @${pkColumn.name}      
      
      SELECT 'Successful Updation' AS [Status]      
     END TRY      
      
     BEGIN CATCH      
      EXEC [LogError]      
      
      SELECT 'Error in Updation' AS [Status]     
     END CATCH      
    END      
    ELSE      
     SELECT 'Duplicate Updation' AS [Status]      
   END      
   ELSE      
    SELECT 'Unauthorised Access' AS [Status]      
  END      
  ELSE      
  BEGIN      
   SELECT 'Unauthorised Access' AS [Status]      
  END      
 END      
 ELSE IF @Action = 'A'      -- to activate
 BEGIN      
  IF dbo.fn_Auth_user_for_manage('${urlSlug}', @UserID) = 1      
  BEGIN      
   SELECT @Cnt = Count(*)      
   FROM [${tableName}] WITH (NOLOCK)      
   WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
    AND ${pkColumn.name} = @${pkColumn.name}      
      
   IF @Cnt > 0      
   BEGIN      
    BEGIN TRY      
     UPDATE [${tableName}]      
     SET [IsDeleted] = 0      
      ,[ModifiedBy] = @UserID      
      ,[ModifiedOn] = dbo.GetCurrentDate()      
     WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
      AND ${pkColumn.name} = @${pkColumn.name}      
      
     SELECT 'Successfully Activated' AS [Status]      
    END TRY      
      
    BEGIN CATCH      
     EXEC [LogError]      
      
     SELECT 'Error in Activation' AS [Status]      
    END CATCH      
   END      
   ELSE      
    SELECT 'Unauthorised Access' AS [Status]      
  END      
  ELSE      
  BEGIN      
   SELECT 'Unauthorised Access' AS [Status]      
  END      
 END      
 ELSE IF @Action = 'D'      -- to delete (soft)
 BEGIN      
  IF dbo.fn_Auth_user_for_manage('${urlSlug}', @UserID) = 1      
  BEGIN      
   SELECT @Cnt = Count(*)      
   FROM [${tableName}] WITH (NOLOCK)      
   WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
    AND ${pkColumn.name} = @${pkColumn.name}      
      
   IF @Cnt > 0      
   BEGIN      
    BEGIN TRY      
     ${hasIsDefault ? `DECLARE @IsDefaultCNT INT      
     DECLARE @IsDefault INT      ` : ''}
      
     UPDATE [${tableName}]      
     SET [IsDeleted] = 1      
      ,[ModifiedBy] = @UserID      
      ,[ModifiedOn] = dbo.GetCurrentDate()      
     WHERE convert(VARCHAR(29), [ModifiedOn], 25) = convert(VARCHAR(29), @ModifiedOn, 25)      
      AND ${pkColumn.name} = @${pkColumn.name}      
      
     ${hasIsDefault ? `--to set as default after deletion        
     SELECT @IsDefaultCNT = count(*)      
     FROM [${tableName}]      
     WHERE ${pkColumn.name} = @${pkColumn.name}      
      
     IF @IsDefaultCNT > 0      
     BEGIN      
      UPDATE [${tableName}]      
      SET IsDefault = 0      
      
      SELECT @IsDefault = MIN(${pkColumn.name})      
      FROM [${tableName}]      
      WHERE [IsDeleted] = 0      
      
      UPDATE [${tableName}]      
      SET IsDefault = 1      
      WHERE ${pkColumn.name} = @IsDefault      
       --to set as default after deletion        
     END` : ''}      
      
     SELECT 'Successful Deletion' AS [Status]      
    END TRY      
      
    BEGIN CATCH      
     EXEC [LogError]      
      
     SELECT 'Error in Deletion' AS [Status]      
    END CATCH      
   END      
   ELSE      
    SELECT 'Unauthorised Access' AS [Status]      
  END      
  ELSE      
  BEGIN      
   SELECT 'Unauthorised Access' AS [Status]      
  END      
 END          
 ELSE IF @Action = 'E'      -- view single record
 BEGIN      
  IF dbo.fn_Auth_user_for_manage('${urlSlug}', @UserID) = 1      
  BEGIN      
   SELECT [${pkColumn.name}]      
    ,[${nameColumn.name}]      
${customColumns.map(col => `    ,C.[${col.name}]`).join('\n')}${customColumns.length > 0 ? '\n' : ''}    ,C.[IsDeleted]      
    ,C.[CreatedOn]      
    ,C.[CreatedBy]      
    ,ISNULL(UC.Employee_Name, '') AS [Creator]      
    ,C.[ModifiedBy]      
    ,C.[ModifiedOn]      
    ,ISNULL(UM.Employee_Name, '') AS [Modifier]      
   FROM [${tableName}] C WITH (NOLOCK)      
   INNER JOIN [tbl_Users] UC WITH (NOLOCK) ON UC.UserID = C.CreatedBy      
    AND UC.IsDeleted = 0      
   INNER JOIN [tbl_Users] UM WITH (NOLOCK) ON UM.UserID = C.ModifiedBy      
    AND UM.IsDeleted = 0      
   WHERE C.CompanyID = @CompanyID      
    AND (      
     CASE       
      WHEN @${pkColumn.name} IS NOT NULL      
       AND [${pkColumn.name}] = @${pkColumn.name}      
       THEN 1      
      WHEN @${pkColumn.name} IS NULL      
       THEN 1      
      ELSE 0      
      END = 1      
     )      
  END      
  ELSE      
  BEGIN      
   SELECT 'Unauthorised Access' AS [Status]      
  END      
 END      
    
END`;
  };

  // 2. Generate XML DBMapping Code
  const generateXmlCode = () => {
    return `<api name="Process${pascalCaseName}" spname="usp_Process_${baseName}" servicename="dbConString" CommandTimeout="300">
	<params>
		<param name="Action" param_type="IN" value="" type="string" length="1" Required="false" Format=""/>
		<param name="IsDeleted" param_type="IN" value="" type="bit" length="50" Required="false" Format=""/>
		<param name="UserID" param_type="IN" value="" type="string" length="50" Required="true" Format=""/>
		<param name="ModifiedOn" param_type="IN" value="" type="string" length="20" Required="false" Format="yyyy-mm-dd HH:mm:ss"/>
		<param name="${nameColumn.name}" param_type="IN" value="" type="string" length="${nameColumn.length || '50'}" Required="false" Format=""/>
		<param name="${pkColumn.name}" param_type="IN" value="" type="INT" length="10" Required="false" Format=""/>
		<param name="CompanyID" param_type="IN" value="" type="string" length="1000" Required="false" Format=""/>
${customColumns.map(col => `		<param name="${col.name}" param_type="IN" value="" type="${col.type === 'bit' ? 'bit' : col.type === 'int' ? 'INT' : 'string'}" length="${col.length || '50'}" Required="false" Format=""/>`).join('\n')}${customColumns.length > 0 ? '\n' : ''}		<param name="XmlString" param_type="IN" value="" type="string" length="1000" Required="false" Format=""/>
	</params>
</api>`;
  };

  // 3. Generate DataManager method
  const generateDataManagerCode = () => {
    const paramsList = [
      `obj${pascalCaseName}.Action`,
      `obj${pascalCaseName}.IsDeleted.TrimmedString()`,
      `FlyingSession.UserID.TrimmedString()`,
      `obj${pascalCaseName}.ModifiedOn`,
      `obj${pascalCaseName}.${nameColumn.name}`,
      `obj${pascalCaseName}.${pkColumn.name}`,
      `FlyingSession.CompanyID.TrimmedString()`,
      ...customColumns.map(col => {
        if (col.type === 'bit') {
          return `obj${pascalCaseName}.${col.name}.TrimmedString()`;
        } else if (col.type === 'int') {
          return `obj${pascalCaseName}.${col.name}.TrimmedString()`;
        }
        return `obj${pascalCaseName}.${col.name}`;
      }),
      `obj${pascalCaseName}.XmlString`
    ];

    return `public static string Process${pascalCaseName}(${pascalCaseName} obj${pascalCaseName})
 {
     try
     {
         return GetResponseFromDataBase(MethodInfo.GetCurrentMethod().Name, new string[] { 
             ${paramsList.join(',\n             ')} 
         });
     }
     catch (Exception ex)
     {
         ErrorLog.LogError(ex);
         throw ex;
     }
 }`;
  };

  // 4. Generate C# Model Class Code
  const generateModelCode = () => {
    return `public class ${pascalCaseName}
 {
     public string ${pkColumn.name} { get; set; }
     public string ${nameColumn.name} { get; set; }
${customColumns.map(col => `     public ${col.type === 'bit' ? 'bool' : 'string'} ${col.name} { get; set; }`).join('\n')}${customColumns.length > 0 ? '\n' : ''}     public string ModifiedOn { get; set; }
     public string CreatedOn { get; set; }
     public string ModifiedBy { get; set; }
     public string CreatedBy { get; set; }
     public string Creator { get; set; }
     public string Modifier { get; set; }
     public bool IsDeleted { get; set; }
     public string Action { get; set; }
     public string XmlString { get; set; }
     ${hasIsDefault ? `public bool IsDefault { get; set; }` : ''}
 }`;
  };

  // Final source code mapping based on active tab
  const getStandardCode = (type: 'sp' | 'xml' | 'datamanager' | 'model') => {
    switch(type) {
      case 'sp': return generateSpCode();
      case 'xml': return generateXmlCode();
      case 'datamanager': return generateDataManagerCode();
      case 'model': return generateModelCode();
    }
  };

  const getActiveCode = () => {
    if (customizedCodes[activeTab]) {
      return customizedCodes[activeTab];
    }
    return getStandardCode(activeTab);
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download code as file
  const handleDownload = () => {
    const code = getActiveCode();
    let filename = '';
    let mime = 'text/plain';
    
    switch (activeTab) {
      case 'sp':
        filename = `usp_Process_${baseName}.sql`;
        mime = 'application/sql';
        break;
      case 'xml':
        filename = `DBMapping_${pascalCaseName}.xml`;
        mime = 'application/xml';
        break;
      case 'datamanager':
        filename = `DataManager_${pascalCaseName}.cs`;
        mime = 'text/plain';
        break;
      case 'model':
        filename = `${pascalCaseName}.cs`;
        mime = 'text/plain';
        break;
    }

    const blob = new Blob([code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Ask AI to customize
  const handleAiCustomize = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    setAiError(null);
    setAiSuccessMessage(null);

    try {
      const response = await fetch('/api/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: schemaInput,
          prompt: aiPrompt,
          fileType: activeTab
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server returned an error');
      }

      if (data.code) {
        setCustomizedCodes(prev => ({
          ...prev,
          [activeTab]: data.code
        }));
        setAiSuccessMessage(`Successfully refined the ${activeTab.toUpperCase()} output!`);
        setAiPrompt('');
      } else {
        throw new Error('Received empty response from server.');
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'An error occurred while connecting to the AI helper.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Reset customized code back to standard template
  const handleResetCustomization = () => {
    setCustomizedCodes(prev => {
      const copy = { ...prev };
      delete copy[activeTab];
      return copy;
    });
    setAiSuccessMessage(null);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0f172a] text-slate-200 font-sans">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <span className="font-bold text-white">S</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              SprocGen <span className="text-slate-500 font-normal text-xs bg-slate-800 px-2 py-0.5 rounded">v2.4</span>
            </h1>
            <p className="text-[10px] text-slate-400">Database & Code Generation Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded border border-[#30363d]">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Database: <span className="text-blue-400 font-mono">DbSquad1AllClientDev</span>
          </div>
          
          <button 
            onClick={() => {
              // Copy all standard files
              const text = `/* STORED PROCEDURE */\n${generateSpCode()}\n\n/* DB MAPPING XML */\n${generateXmlCode()}\n\n/* DATA MANAGER METHOD */\n${generateDataManagerCode()}\n\n/* MODEL CLASS */\n${generateModelCode()}`;
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="bg-[#238636] hover:bg-[#2ea043] transition-colors cursor-pointer px-4 py-1.5 rounded text-sm font-medium text-white shadow-sm flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy All Files
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Panel: Input Schema */}
        <section className="w-1/3 flex flex-col border-r border-[#30363d] bg-[#0d1117]">
          <div className="p-4 border-b border-[#30363d] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Database Schema Input</span>
            </div>
            <button 
              onClick={() => setSchemaInput('')}
              className="text-[10px] text-slate-400 hover:text-white uppercase font-semibold transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="p-3 bg-[#161b22] border-b border-[#30363d] flex flex-wrap gap-2 shrink-0">
            <span className="text-[10px] text-slate-500 w-full mb-1">Load Preset Schema:</span>
            <button 
              onClick={() => {
                setSchemaInput(SAMPLE_SCHEMAS.assetLocation);
                setCustomizedCodes({});
              }}
              className={`text-xs px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                schemaInput === SAMPLE_SCHEMAS.assetLocation 
                  ? 'bg-blue-600 text-white font-medium' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Asset Location
            </button>
            <button 
              onClick={() => {
                setSchemaInput(SAMPLE_SCHEMAS.machineType);
                setCustomizedCodes({});
              }}
              className={`text-xs px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                schemaInput === SAMPLE_SCHEMAS.machineType 
                  ? 'bg-blue-600 text-white font-medium' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> Machine Type
            </button>
            <button 
              onClick={() => {
                setSchemaInput(SAMPLE_SCHEMAS.departmentMaster);
                setCustomizedCodes({});
              }}
              className={`text-xs px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                schemaInput === SAMPLE_SCHEMAS.departmentMaster 
                  ? 'bg-blue-600 text-white font-medium' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Dept Master
            </button>
          </div>

          <div className="flex-1 p-0 relative min-h-0">
            <textarea 
              value={schemaInput}
              onChange={(e) => {
                setSchemaInput(e.target.value);
                setCustomizedCodes({}); // reset customized on input change
              }}
              className="w-full h-full p-4 font-mono text-[12px] bg-[#010409] text-[#e6edf3] resize-none focus:outline-none border-0 leading-relaxed overflow-auto"
              spellCheck="false"
              placeholder="PASTE CREATE TABLE [TableName] SCHEMA HERE..."
            />
          </div>

          {/* Quick config settings inside input sidebar */}
          <div className="p-3 bg-[#161b22] border-t border-[#30363d] shrink-0">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1 tracking-wider">
              Override settings
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">URL Slug:</span>
                <input 
                  type="text" 
                  value={urlSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder={autoUrlSlug}
                  className="bg-[#0d1117] border border-[#30363d] px-2 py-1 rounded text-slate-200 text-xs text-right w-48 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel: Output Tabs & Code View */}
        <section className="flex-1 flex flex-col bg-[#0d1117] min-h-0">
          
          {/* Tab Navigation */}
          <div className="flex items-center justify-between bg-[#161b22] border-b border-[#30363d] shrink-0 px-2">
            <div className="flex">
              <button 
                onClick={() => { setActiveTab('sp'); setAiSuccessMessage(null); }}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'sp' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" /> Stored Procedure
              </button>
              <button 
                onClick={() => { setActiveTab('xml'); setAiSuccessMessage(null); }}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'xml' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" /> DBMapping.xml
              </button>
              <button 
                onClick={() => { setActiveTab('datamanager'); setAiSuccessMessage(null); }}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'datamanager' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> DataManager.cs
              </button>
              <button 
                onClick={() => { setActiveTab('model'); setAiSuccessMessage(null); }}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'model' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Model.cs
              </button>
            </div>

            {/* Actions for active code block */}
            <div className="flex gap-2 pr-2">
              {customizedCodes[activeTab] && (
                <button 
                  onClick={handleResetCustomization}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 border border-[#30363d] cursor-pointer"
                  title="Reset to default template"
                >
                  <RefreshCw className="w-3 h-3" /> Reset Template
                </button>
              )}
              <button 
                onClick={handleCopy}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded text-xs transition-all flex items-center gap-1.5 border border-[#30363d] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button 
                onClick={handleDownload}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded text-xs transition-all flex items-center gap-1.5 border border-[#30363d] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                Download
              </button>
            </div>
          </div>

          {/* AI Banner info if current view is customized */}
          {customizedCodes[activeTab] && (
            <div className="bg-blue-950/40 border-b border-blue-900/50 px-4 py-1.5 flex items-center justify-between text-xs text-blue-400 font-medium shrink-0">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
                This code block has been customized by Gemini AI
              </span>
              <button 
                onClick={handleResetCustomization}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-white"
              >
                Reset to Standard
              </button>
            </div>
          )}

          {/* Code display window */}
          <div className="flex-1 overflow-auto p-4 bg-[#010409] text-[#e6edf3] font-mono text-[13px] leading-relaxed relative min-h-0 select-text">
            {/* Syntax-colored code block */}
            <pre className="whitespace-pre-wrap select-text">{getActiveCode()}</pre>
          </div>

          {/* AI Copilot Input Drawer / Inline Customize */}
          <div className="bg-[#161b22] border-t border-[#30363d] p-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="w-4 h-4 text-blue-400 fill-blue-400/10" />
                <span>Gemini Code Refiner &amp; Customizer</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Modifies {activeTab.toUpperCase()} code using AI
              </span>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAiCustomize();
                }}
                disabled={isAiLoading}
                placeholder="Ask Gemini to customize (e.g. 'remove CompanyID filter', 'use hard delete', 'add parameter for Description')"
                className="flex-1 bg-[#010409] border border-[#30363d] rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button 
                onClick={handleAiCustomize}
                disabled={isAiLoading || !aiPrompt.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Refine Code
                  </>
                )}
              </button>
            </div>

            {/* Error or success messages */}
            {aiError && (
              <div className="mt-2 text-red-400 text-xs flex items-center gap-1.5 bg-red-950/20 px-3 py-1.5 rounded border border-red-900/30">
                <AlertCircle className="w-3.5 h-3.5" />
                {aiError}
              </div>
            )}
            {aiSuccessMessage && (
              <div className="mt-2 text-green-400 text-xs flex items-center justify-between bg-green-950/20 px-3 py-1.5 rounded border border-green-900/30">
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {aiSuccessMessage}
                </span>
                <button onClick={() => setAiSuccessMessage(null)} className="text-slate-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Stats Bar */}
          <div className="h-10 bg-[#0d1117] border-t border-[#30363d] flex items-center px-6 gap-8 text-[11px] select-none shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">SP GEN:</span>
              <span className="text-green-400 font-medium italic">Success</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">XML MAPPING:</span>
              <span className="text-green-400 font-medium italic">Generated</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">MODEL CLASS:</span>
              <span className="text-green-400 font-medium italic">Ready</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="font-bold text-slate-500">TABLE DETECTED:</span>
              <span className="text-blue-400">{tableName}</span>
            </div>
            <div className="ml-auto text-slate-500">
              <span>Encoding: UTF-8</span>
            </div>
          </div>
        </section>

      </main>

    </div>
  );
}
