from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PageRepositoryModel, TestModuleModel, TestProjectModel

logger = logging.getLogger(__name__)


class PageConfigurationAgent:
    """Creates or reuses project, module, and page records."""

    async def ensure_project(self, db: AsyncSession, project_name: str) -> TestProjectModel:
        result = await db.execute(
            select(TestProjectModel).where(TestProjectModel.name == project_name).limit(1)
        )
        project = result.scalar_one_or_none()
        if project:
            logger.info("PageConfigurationAgent: reusing project '%s' (%s)", project_name, project.id)
            return project

        project = TestProjectModel(name=project_name, description="Created by AI Workflow")
        db.add(project)
        await db.flush()
        logger.info("PageConfigurationAgent: created project '%s' (%s)", project_name, project.id)
        return project

    async def ensure_module(
        self, db: AsyncSession, project_id: str, module_name: str
    ) -> TestModuleModel:
        result = await db.execute(
            select(TestModuleModel)
            .where(TestModuleModel.project_id == project_id)
            .where(TestModuleModel.name == module_name)
            .limit(1)
        )
        module = result.scalar_one_or_none()
        if module:
            logger.info("PageConfigurationAgent: reusing module '%s' (%s)", module_name, module.id)
            return module

        module = TestModuleModel(
            project_id=project_id,
            name=module_name,
            description="Created by AI Workflow",
        )
        db.add(module)
        await db.flush()
        logger.info("PageConfigurationAgent: created module '%s' (%s)", module_name, module.id)
        return module

    async def ensure_page(
        self, db: AsyncSession, project_id: str, module_id: str, page_name: str, url: str, platform: str
    ) -> PageRepositoryModel:
        result = await db.execute(
            select(PageRepositoryModel)
            .where(PageRepositoryModel.project_id == project_id)
            .where(PageRepositoryModel.name == page_name)
            .limit(1)
        )
        page = result.scalar_one_or_none()
        if page:
            if url and page.url_pattern != url:
                page.url_pattern = url
                await db.flush()
            logger.info("PageConfigurationAgent: reusing page '%s' (%s)", page_name, page.id)
            return page

        page = PageRepositoryModel(
            name=page_name,
            url_pattern=url,
            description="Created by AI Workflow",
            platform=platform,
            project_id=project_id,
            module_id=module_id,
        )
        db.add(page)
        await db.flush()
        logger.info("PageConfigurationAgent: created page '%s' (%s)", page_name, page.id)
        return page
