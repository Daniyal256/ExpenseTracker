IF DB_ID('ExpenseTracker') IS NULL
BEGIN
    CREATE DATABASE ExpenseTracker;
END
GO

USE ExpenseTracker;
GO

IF OBJECT_ID('dbo.Projects', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Projects (
        ProjectId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(120) NOT NULL,
        Budget DECIMAL(12,2) NOT NULL CONSTRAINT CK_Projects_Budget CHECK (Budget >= 0),
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('dbo.Members', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Members (
        MemberId INT IDENTITY(1,1) PRIMARY KEY,
        ProjectId INT NOT NULL,
        Name NVARCHAR(120) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Members_Projects FOREIGN KEY (ProjectId) REFERENCES dbo.Projects(ProjectId) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.Categories', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        CategoryId INT IDENTITY(1,1) PRIMARY KEY,
        ProjectId INT NOT NULL,
        Name NVARCHAR(120) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Categories_Projects FOREIGN KEY (ProjectId) REFERENCES dbo.Projects(ProjectId) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.ExpenseItems', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExpenseItems (
        ExpenseItemId INT IDENTITY(1,1) PRIMARY KEY,
        CategoryId INT NOT NULL,
        MemberId INT NOT NULL,
        Name NVARCHAR(160) NOT NULL,
        Amount DECIMAL(12,2) NOT NULL CONSTRAINT CK_ExpenseItems_Amount CHECK (Amount > 0),
        PaymentMethod NVARCHAR(20) NOT NULL CONSTRAINT CK_ExpenseItems_Method CHECK (PaymentMethod IN ('cash', 'online')),
        PaidAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ExpenseItems_Categories FOREIGN KEY (CategoryId) REFERENCES dbo.Categories(CategoryId) ON DELETE CASCADE,
        CONSTRAINT FK_ExpenseItems_Members FOREIGN KEY (MemberId) REFERENCES dbo.Members(MemberId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Members_ProjectId' AND object_id = OBJECT_ID('dbo.Members'))
    CREATE INDEX IX_Members_ProjectId ON dbo.Members(ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Categories_ProjectId' AND object_id = OBJECT_ID('dbo.Categories'))
    CREATE INDEX IX_Categories_ProjectId ON dbo.Categories(ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ExpenseItems_CategoryId' AND object_id = OBJECT_ID('dbo.ExpenseItems'))
    CREATE INDEX IX_ExpenseItems_CategoryId ON dbo.ExpenseItems(CategoryId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ExpenseItems_MemberId' AND object_id = OBJECT_ID('dbo.ExpenseItems'))
    CREATE INDEX IX_ExpenseItems_MemberId ON dbo.ExpenseItems(MemberId);
GO
