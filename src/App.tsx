import React, { useState, useEffect } from 'react';
import { 
  Database, 
  FileCode, 
  Code2, 
  Copy, 
  Check, 
  Download, 
  Layers, 
  Cpu, 
  Code,
  FileSpreadsheet,
  FileText
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

type TabType = 'sp' | 'xml' | 'datamanager' | 'model' | 'js' | 'controller' | 'view' | 'partialView';

export default function App() {
  const [schemaInput, setSchemaInput] = useState(SAMPLE_SCHEMAS.assetLocation);
  const [activeTab, setActiveTab] = useState<TabType>('sp');
  const [copied, setCopied] = useState(false);
  
  // Custom URL slug and system-specific inputs
  const [customSlug, setCustomSlug] = useState('');
  
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

  // 5. Generate Javascript code
  const generateJsCode = () => {
    const customFieldsMapping = customColumns.map(col => {
      if (col.type === 'bit') {
        return `                ${col.name}: $('#chkIsDeleted${col.name}').prop('checked')`;
      }
      return `                ${col.name}: $('#txt${col.name}').val()`;
    }).join(',\n');

    return `function Process${pascalCaseName}() {
    try {
        if (IsValid${pascalCaseName}Data()) {
            $('#Asset${pascalCaseName}Button').attr('disabled', true);
            $('#Asset${pascalCaseName}Button').addClass('disabled');
            var Data = {
                ${pkColumn.name}: $('#hdnID').val(),
                ${nameColumn.name}: $('#txtName${pascalCaseName}').val(),
${customFieldsMapping ? customFieldsMapping + ',\n' : ''}                ModifiedOn: $('#hdnDTMM').val(),
                IsDeleted: $('#chkIsDeleted${pascalCaseName}').prop('checked'),
                Action: ($('#hdnID').val() == '0' || $('#hdnID').val() == '' ? 'I' : 'U'),
            };
            $.ajax({
                url: FlyingStarRootPath + "/Settings/Asset/Process${pascalCaseName}",
                data: { jsonData: JSON.stringify(Data) },
                type: "POST",
                datatype: "json",
                cache: false,
                success: function (response) {
                    if (response != null && response != undefined && response.success)
                    {
                        if (response.message != null && response.message == 'Success')
                        {
                            ShowMessage(JSON.parse(response.data)[0]["Status"], response.message);
                            clear${pascalCaseName}();
                            showHideSections('View');
                            fetch${pascalCaseName}();
                        }
                        else
                            ShowMessage(response.data, response.message);
                    }
                    else ShowMessage(response.data, response.message);
                    $('#Asset${pascalCaseName}Button').removeAttr('disabled');
                    $('#Asset${pascalCaseName}Button').removeClass('disabled');
                },
                error: function (er) {
                    console.log(er);
                    $('#Asset${pascalCaseName}Button').removeAttr('disabled');
                    $('#Asset${pascalCaseName}Button').removeClass('disabled');
                }
            });
        }
    } catch (e) {
        console.log(e);
    }
}

function clear${pascalCaseName}(isManage) {
    try {
        $('#txtName${pascalCaseName}').val('');
        $('#hdnID').val('');
        $('#hdnDTMM').val('');
        $('#chkIsDeleted${pascalCaseName}').prop('checked', false);
${customColumns.map(col => col.type === 'bit' ? `        $('#chkIsDeleted${col.name}').prop('checked', false);` : `        $('#txt${col.name}').val('');`).join('\n')}
        if (isManage)
            activateTab('manage');
        else
            activateTab('view');
    } catch (e) {
        console.log(e);
    }
}

$(document).ready(function () {
    try {
        $('#btnSubmit').click(function (e) {
            e.preventDefault();
            hideMessage();
            Process${pascalCaseName}();
        });
        $('#btnCancel').click(function (e) {
            e.preventDefault();
            clear${pascalCaseName}();
            fetch${pascalCaseName}();
        });
        BindDataTables('tbl_View');
        bulkUploadFile('ipfileEMP', '${pascalCaseName}', '${pascalCaseName}');
    } catch (e) {
        console.log(e);
    }
});

function fetch${pascalCaseName}() {
    try {
        ShowLoadingMsg('view');
        var Data = {
            ${pkColumn.name}: $('#hdnID').val(),
            ${nameColumn.name}: $('#txtName${pascalCaseName}').val(),
${customFieldsMapping ? customFieldsMapping + ',\n' : ''}            ModifiedOn: $('#hdnDTMM').val(),
            IsDeleted: $('#chkIsDeleted${pascalCaseName}').prop('checked'),
            Action: 'S',
        };
        var StarAjax = $.ajax({
            url: FlyingStarRootPath + "/Settings/Asset/Fetch${pascalCaseName}",
            data: { jsonData: JSON.stringify(Data) },
            type: "POST",
            datatype: "html",
            success: function (response) {
                if (response.indexOf('errorcode') == -1) {
                    $('#view').html(response);
                    BindDataTables('tbl_View');
                    Acccess();
                }
                else {
                    ShowMessage(response.data, response.message);
                }
            },
            error: function (er) {
                console.log(er);
            }
        });
    } catch (e) {
        console.log(e);
    }
}

function edit${pascalCaseName}(id) {
    try {
        if (id != null && id != undefined && id != '') {
            var Data = {
                ${pkColumn.name}: id,
                ${nameColumn.name}: '',
                ModifiedOn: '',
                IsDeleted: false,
                Action: 'E',
            };
            $.ajax({
                url: FlyingStarRootPath + "/Settings/Asset/Process${pascalCaseName}",
                data: { jsonData: JSON.stringify(Data) },
                type: "POST",
                success: function (response) {
                    if (response != null && response != undefined) {
                        if (response.success) {
                            var data = JSON.parse(response.data)[0];
                            $('#txtName${pascalCaseName}').val(data.${nameColumn.name});
                            $('#hdnID').val(data.${pkColumn.name});
                            $('#hdnDTMM').val(data.ModifiedOn);
                            if (data.IsDeleted) {
                                $('#chkIsDeleted${pascalCaseName}').prop('checked', true);
                            }
                            else if (!data.IsDeleted) {
                                $('#chkIsDeleted${pascalCaseName}').prop('checked', false);
                            }
${customColumns.map(col => {
  if (col.type === 'bit') {
    return `                            if (data.${col.name}) {
                                $('#chkIsDeleted${col.name}').prop('checked', true);
                            } else {
                                $('#chkIsDeleted${col.name}').prop('checked', false);
                            }`;
  }
  return `                            $('#txt${col.name}').val(data.${col.name});`;
}).join('\n')}
                            showHideSections('manage');
                        }
                        else
                            ShowMessage(response.data, response.message);
                    }
                },
                error: function (er) {
                    console.log(er);
                }
            });
        }
        else
            ShowMessage('Invalid Selection', 'ERROR');
    } catch (e) {
        console.log(e);
    }
}

function delete${pascalCaseName}(id, action) {
    try {
        if(action == undefined)
            action = 'D';
        if (id != null && id != undefined && id != '') {
            var Data = {
                ${pkColumn.name}: id,
                ${nameColumn.name}: '',
                ModifiedOn: $('#DTM_' + id).val(),
                IsDeleted: false,
                Action: action,
            };
            $.ajax({
                url: FlyingStarRootPath + "/Settings/Asset/Process${pascalCaseName}",
                data: { jsonData: JSON.stringify(Data) },
                type: "POST",
                success: function (response) {
                    if (response != null && response != undefined && response.success) {
                        if (response.message != null && response.message == 'Success') {
                            ShowMessage(JSON.parse(response.data)[0]["Status"], response.message);
                            clear${pascalCaseName}();
                            activateTab('View');
                            fetch${pascalCaseName}();
                        }
                        else
                            ShowMessage(response.data, response.message);
                    }
                    else ShowMessage(response.data, response.message);
                },
                error: function (er) {
                    console.log(er);
                }
            });
        }
        else
            ShowMessage('Invalid Selection', 'ERROR');
    } catch (e) {
        console.log(e);
    }
}

function IsDefault(id, action) {
    try {
        if (action == undefined)
            action = 'G';
        if (id != null && id != undefined && id != '') {
            var Data = {
                ${pkColumn.name}: id,
                ${nameColumn.name}: '',
                ModifiedOn: $('#DTM_' + id).val(),
                Action: action,
            };
            $.ajax({
                url: FlyingStarRootPath + "/Settings/Asset/Process${pascalCaseName}",
                data: { jsonData: JSON.stringify(Data) },
                type: "POST",
                success: function (response) {
                    if (response != null && response != undefined && response.success) {
                        if (response.message != null && response.message == 'Success') {
                            ShowMessage(JSON.parse(response.data)[0]["Status"], response.message);
                            clear${pascalCaseName}();
                            activateTab('View');
                            fetch${pascalCaseName}();
                            Acccess();
                        }
                        else
                            ShowMessage(response.data, response.message);
                    }
                    else ShowMessage(response.data, response.message);
                },
                error: function (er) {
                    console.log(er);
                }
            });
        }
        else
            ShowMessage('Invalid Selection', 'ERROR');
    } catch (e) {
        console.log(e);
    }
}

function IsValid${pascalCaseName}Data() {
    var sbError = new StringBuilder();
    if (ValidateValue($('#txtName${pascalCaseName}').val()) == '') {
        sbError.append('Please Enter ${baseName.replace(/_/g, ' ')} Name' + '<br/>');
    }
    else if (ValidateValue($('#txtName${pascalCaseName}').val()) != '' && ValidateValue($('#txtName${pascalCaseName}').val()).length > 100) {
        sbError.append('Maxlength allowed is 100 for ${baseName.replace(/_/g, ' ')} Name' + '<br/>');
    }
    else if (ValidateValue($('#txtName${pascalCaseName}').val()) != '' && !isSpclChar($('#txtName${pascalCaseName}').val())) {
        sbError.append('Please Enter Valid ${baseName.replace(/_/g, ' ')} Name' + '<br/>');
    }
    if (sbError.toString() == '') {
        return true;
    }
    else if (sbError.toString() != '') {
        ShowMessage(sbError.toString(), 'error', '${baseName.replace(/_/g, ' ')}');
        return false;
    }
}

function quickAccessAdd() {
    $('#dvaddbutton').hide();
    showHideSections('manage');
    clear${pascalCaseName}();
}

function quickAccessView() {
    $('#dvaddbutton').show();
    showHideSections('view');
    clear${pascalCaseName}();
    fetch${pascalCaseName}();
}

function showHideSections(type) {
    _destroyDataTables();
    switch (type.toLowerCase()) {
        case "view":
            {
                $('#view').show();
                $('#manage').hide();
                $('#bulkupload').hide();
                $('.btn-back').hide();
                $('#dvaddbutton').show();
                break;
            }
        case "manage":
            {
                $('#view').hide();
                $('#manage').show();
                $('#bulkupload').hide();
                $('.btn-back').show();
                $('#dvaddbutton').hide();
                break;
            }
        case "bulk":
            {
                $('#view').hide();
                $('#manage').hide();
                $('#bulkupload').show();
                $('.btn-back').show();
                $('#dvaddbutton').hide();
                break;
            }
        default: {
            $('#view').show();
            $('#manage').hide();
            $('.btn-back').hide();
            $('#dvaddbutton').show();
            break;
        }
    }
}

function BulkUploadShowHide() {
    if ($('#btnBulkUpload').html().indexOf('Bulk') > -1) {
        $('#dvinsert').hide();
        $('#dvBulkUploadEmp').show();
        $('#dvinsertFooter').hide();
        $('#dvinsertFooter').removeClass('d-md-inline-flex').removeClass('d-sm-block');
        $('#btnBulkUpload').html('Manual Upload <i class="icon-paperplane ml-2"></i>');
    }
    else {
        activateTab('manage');
        $('#dvinsert').show();
        $('#dvinsertFooter').show();
        $('#dvinsertFooter').addClass('d-md-inline-flex').addClass('d-sm-block');
    }
}`;
  };

  // 6. Generate Controller code
  const generateControllerCode = () => {
    return `public ActionResult ${pascalCaseName}()
 {
     ${pascalCaseName} obj${pascalCaseName} = new Models.${pascalCaseName}();
     obj${pascalCaseName}.Action = "S";
     string strType = FlyingStarDataManager.Process${pascalCaseName}(obj${pascalCaseName});
     List<${pascalCaseName}> arr${pascalCaseName} = JsonConvert.DeserializeObject<List<${pascalCaseName}>>(strType);
     return View("${pascalCaseName}", arr${pascalCaseName});
 }

 [HttpPost, ValidateHeaderAntiForgeryToken]
 public ActionResult Process${pascalCaseName}(string jsonData, string SearchText = "")
 {
     bool isSuccess = false;
     string strResponse = string.Empty;
     try
     {
         var result = JsonConvert.DeserializeObject<${pascalCaseName}>(jsonData);
         strResponse = validate${pascalCaseName}(result);
         if (strResponse.TrimmedString().Length.Equals(0))
         {
             strResponse = FlyingStarDataManager.Process${pascalCaseName}(result);
             if (strResponse.TrimmedString().Length > 0)
             {
                 isSuccess = true;
             }
         }
     }
     catch (Exception ex)
     {
         ErrorLog.LogError(ex);
     }
     return Json(new
     {
         success = isSuccess,
         message = isSuccess ? "Success" : "Error",
         data = strResponse,
     }, JsonRequestBehavior.AllowGet);
 }

 [HttpPost, ValidateHeaderAntiForgeryToken]
 public ActionResult Fetch${pascalCaseName}(string jsonData)
 {
     try
     {
         var result = JsonConvert.DeserializeObject<${pascalCaseName}>(jsonData);
         string strType = FlyingStarDataManager.Process${pascalCaseName}(result);
         List<${pascalCaseName}> arr${pascalCaseName} = JsonConvert.DeserializeObject<List<${pascalCaseName}>>(strType);
         return PartialView("~/Areas/Settings/Views/Asset/_${pascalCaseName}View.cshtml", arr${pascalCaseName});
     }
     catch (Exception ex)
     {
         ErrorLog.LogError(ex);
         return null;
     }
 }

 private string validate${pascalCaseName}(${pascalCaseName} obj${pascalCaseName})
 {
     StringBuilder strReturn = new StringBuilder("");
     string strBreakLine = "<br/>";
     if (obj${pascalCaseName}.Action.Equals("I") || obj${pascalCaseName}.Action.Equals("U"))
     {
         strReturn.Append(Validations.ValidateText(obj${pascalCaseName}.${nameColumn.name}, Validations.IsRequired.Mandatory, "${baseName.replace(/_/g, ' ')} Name", Validations.ValidationType.SQLInject, 100));
${customColumns.map(col => {
  if (col.type.includes('varchar') || col.type.includes('text')) {
    return `         strReturn.Append(Validations.ValidateText(obj${pascalCaseName}.${col.name}, Validations.IsRequired.Optional, "${col.name.replace(/_/g, ' ')}", Validations.ValidationType.SQLInject, ${col.length || '500'}));`;
  }
  return '';
}).filter(Boolean).join('\n')}
     }
     return strReturn.ToString().Replace(strBreakLine + strBreakLine, "");
 }`;
  };

  // 7. Generate View HTML code
  const generateViewHtmlCode = () => {
    return `@{
    Layout = "~/Views/Shared/_Layout.cshtml";
}
@Html.Partial("~/Areas/Settings/Views/Shared/_SettingsAddButton.cshtml")
<div class="companyform-wrapper">
    <div class="companyform-innerwrp">

        <div class="companybtm-formwrap">
            <div class="companytabs-formwrap">
                <div id="view">
                    <div class="table-responsive">
                        @Html.Partial("_${pascalCaseName}View")
                    </div>
                </div>
                <div id="manage" style="display:none">
                    <div class="p-2">
                        <div class="personindivid-head header-elements-inline">
                            ${baseName.replace(/_/g, ' ')}
                        </div>
                        <div id="dvinsert">
                            @Html.Partial("~/Areas/Settings/Views/Asset/_Add${pascalCaseName}.cshtml")
                        </div>
                        <div class="squadconfiq-btnwrap">
                            <div class="commonform-btnwrap">
                                <div class="btnSection" id="dvinsertFooter">
                                    <button type="button" class="btn canclebtn" onclick="clear${pascalCaseName}(); showHideSections('manage');">Cancel </button>
                                    <button type="button" class="btn bg-squad1Blue text-squad1Blue border-squad1Blue" onclick="clear${pascalCaseName}(); showHideSections('bulk');">Bulk Upload </button>
                                    <button type="button" id="Asset${pascalCaseName}Button" class="btn submitbtn btn-leftmargin" onclick="Process${pascalCaseName}();">Submit</button>
                                </div>
                                <input type="hidden" id="hdnID" value="0" />
                                <input type="hidden" id="hdnDTMM" value="" />
                            </div>
                        </div>
                    </div>
                </div>
                <div id="bulkupload" style="display:none">
                    <div class="col-12">
                        <div class="p-2">
                            <div class="personindivid-head header-elements-inline">
                                ${baseName.replace(/_/g, ' ')}
                            </div>
                            <div id="dvBulkUploadEmp">
                                <div id="dv_fu_BulkUploadEmp">
                                    <label class="bulkupload-label">Upload ${baseName.replace(/_/g, ' ')} <span class="small-label"></span> </label>
                                    <div class="col-lg-9">
                                        <input type="file" id="ipfileEMP" class="file-input" data-show-preview="false" data-browse-class="btn btn-primary" data-remove-class="btn btn-default" accept=".xls,.xlsx">
                                        <input type="hidden" value="" id="fileEMP" />
                                    </div>
                                </div>
                                <br />
                                <div class="btnSection">
                                    <a class="btn canclebtn" onclick="DownloadFile('${pascalCaseName}.xlsx', '/Downloads/');">Download Sample File<i class="icon-file-download ml-2"></i></a>
                                    <a class="btn submitbtn mx-sm-2" id="btnBulkUpload" onclick="quickAccessAdd();">Manual Upload <i class="icon-paperplane ml-2"></i></a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@Scripts.Render("~/bundles/js/fileuploadlibs")
<script type="text/javascript" src="@Url.Content("~/content/js/settings/asset/${baseName.toLowerCase().replace(/_/g, '')}.js?rd=" + "" + ViewBag.ReferenceNumber)"></script>`;
  };

  // 8. Generate Partial View code
  const generatePartialViewCode = () => {
    return `@model IEnumerable<TKGRC.Areas.Settings.Models.${pascalCaseName}>


@if (Model == null || Model.Count() == 0)
{
    @Html.NoDataHTML("", "No ${baseName.replace(/_/g, ' ')} Available to show");
}
else
{
    <table class="table table-squad1" id="tbl_View_${pascalCaseName}">
        <thead>
            <tr>
                <th>${baseName.replace(/_/g, ' ')} Name</th>
${customColumns.map(col => `                <th>${col.name.replace(/_/g, ' ')}</th>`).join('\n')}
                <th>Is Active</th>
                <th class="text-center viewAccess">Actions</th>
            </tr>
        </thead>
        <tbody>

            @foreach (var item in Model)
            {
                string strRowClass = string.Empty;
                ${hasIsDefault ? `if (item.IsDefault)
                {
                    strRowClass = "table-info";
                }` : ''}
                <tr class="@strRowClass">
                    <td>@item.${nameColumn.name}</td>
${customColumns.map(col => `                    <td>@item.${col.name}</td>`).join('\n')}
                    @if (item.IsDeleted)
                    {
                        <td><span class="badge badge-danger">Inactive</span></td>
                    }
                    else
                    {
                        <td><span class="badge badge-success">Active</span></td>
                    }
                    <td class="text-center">
                        <div class="list-icons">
                            <div class="dropdown viewAccess">
                                <a href="#" class="list-icons-item" data-toggle="dropdown">
                                    <i class="mi-more-horiz mi-2x"></i>
                                </a>
                                <input type="hidden" id="DTM_@item.${pkColumn.name}" value="@item.ModifiedOn" />

                                <div class="dropdown-menu dropdown-menu-right">
                                    <a href="#" onclick="edit${pascalCaseName}('@item.${pkColumn.name}');" class="dropdown-item"><i class="icon-pencil5"></i> Edit</a>
                                    @if (item.IsDeleted)
                                    {
                                        <a href="#" onclick="delete${pascalCaseName}('@item.${pkColumn.name}', 'A');" class="dropdown-item"><i class="icon-checkmark"></i> Activate</a>
                                    }
                                    else
                                    {
                                        <a href="#" onclick="delete${pascalCaseName}('@item.${pkColumn.name}', 'D');" class="dropdown-item"><i class="icon-trash"></i> Delete</a>
                                    }

                                    ${hasIsDefault ? `@if (!item.IsDefault && !item.IsDeleted)
                                    {
                                        <a href="#" onclick="IsDefault('@item.${pkColumn.name}', 'G');" class="dropdown-item"><i class="icon-pushpin"></i> Set as Default</a>
                                    }` : ''}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            }

        </tbody>
    </table>
}`;
  };

  // Final source code mapping based on active tab
  const getStandardCode = (type: TabType) => {
    switch(type) {
      case 'sp': return generateSpCode();
      case 'xml': return generateXmlCode();
      case 'datamanager': return generateDataManagerCode();
      case 'model': return generateModelCode();
      case 'js': return generateJsCode();
      case 'controller': return generateControllerCode();
      case 'view': return generateViewHtmlCode();
      case 'partialView': return generatePartialViewCode();
    }
  };

  const getActiveCode = () => {
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
      case 'js':
        filename = `${baseName.toLowerCase().replace(/_/g, '')}.js`;
        mime = 'application/javascript';
        break;
      case 'controller':
        filename = `${pascalCaseName}Controller.cs`;
        mime = 'text/plain';
        break;
      case 'view':
        filename = `${pascalCaseName}.cshtml`;
        mime = 'text/html';
        break;
      case 'partialView':
        filename = `_${pascalCaseName}View.cshtml`;
        mime = 'text/html';
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
          <button 
            onClick={() => {
              // Copy all standard files
              const text = `/* STORED PROCEDURE */\n${generateSpCode()}\n\n/* DB MAPPING XML */\n${generateXmlCode()}\n\n/* DATA MANAGER METHOD */\n${generateDataManagerCode()}\n\n/* MODEL CLASS */\n${generateModelCode()}\n\n/* JAVASCRIPT CONTROLLER */\n${generateJsCode()}\n\n/* CONTROLLER ACTION */\n${generateControllerCode()}\n\n/* VIEW HTML */\n${generateViewHtmlCode()}\n\n/* PARTIAL VIEW */\n${generatePartialViewCode()}`;
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
        <section className="flex-1 flex flex-col bg-[#0d1117] min-h-0 border-l border-[#30363d]">
          
          {/* Tab Navigation */}
          <div className="flex items-center justify-between bg-[#161b22] border-b border-[#30363d] shrink-0 overflow-x-auto select-none">
            <div className="flex flex-wrap md:flex-nowrap">
              <button 
                onClick={() => { setActiveTab('sp'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'sp' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" /> SP
              </button>
              <button 
                onClick={() => { setActiveTab('xml'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'xml' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" /> XML Mapping
              </button>
              <button 
                onClick={() => { setActiveTab('datamanager'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'datamanager' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> DataManager
              </button>
              <button 
                onClick={() => { setActiveTab('model'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'model' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Model.cs
              </button>
              <button 
                onClick={() => { setActiveTab('js'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'js' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-500" /> JS Code
              </button>
              <button 
                onClick={() => { setActiveTab('controller'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'controller' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-purple-400" /> Controller
              </button>
              <button 
                onClick={() => { setActiveTab('view'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'view' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" /> View.cshtml
              </button>
              <button 
                onClick={() => { setActiveTab('partialView'); }}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 flex items-center gap-1 shrink-0 ${
                  activeTab === 'partialView' 
                    ? 'border-blue-500 text-blue-400 bg-[#0d1117]/50 font-bold' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" /> _PartialView
              </button>
            </div>

            {/* Actions for active code block */}
            <div className="flex gap-2 pr-2 shrink-0">
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

          {/* Code display window */}
          <div className="flex-1 overflow-auto p-4 bg-[#010409] text-[#e6edf3] font-mono text-[13px] leading-relaxed relative min-h-0 select-text">
            {/* Syntax-colored code block */}
            <pre className="whitespace-pre-wrap select-text">{getActiveCode()}</pre>
          </div>

          {/* Quick Stats Bar */}
          <div className="h-10 bg-[#0d1117] border-t border-[#30363d] flex items-center px-6 gap-8 text-[11px] select-none shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">SP:</span>
              <span className="text-green-400 font-medium italic">Success</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">XML:</span>
              <span className="text-green-400 font-medium italic">Generated</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">MODEL:</span>
              <span className="text-green-400 font-medium italic">Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">JS:</span>
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
