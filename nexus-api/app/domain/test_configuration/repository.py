"""Async repository for Test Configuration persistence."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import (
    TestCaseModel,
    TestModuleModel,
    TestProjectModel,
    TestStepModel,
)
from app.domain.test_configuration.schemas import (
    TestCaseCreateSchema,
    TestCaseUpdateSchema,
    TestModuleCreateSchema,
    TestModuleUpdateSchema,
    TestProjectCreateSchema,
    TestProjectUpdateSchema,
    TestStepCreateSchema,
    TestStepUpdateSchema,
)


class TestConfigurationError(ValueError):
    """Raised when an entity lookup or update is invalid."""


class TestConfigurationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_projects(self, status: str | None = None) -> list[TestProjectModel]:
        query = (
            select(TestProjectModel)
            .options(
                selectinload(TestProjectModel.modules)
                .selectinload(TestModuleModel.test_cases)
                .selectinload(TestCaseModel.test_steps)
            )
            .order_by(TestProjectModel.created_at.desc())
        )
        if status:
            query = query.where(TestProjectModel.status == status)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_project(self, project_id: str) -> TestProjectModel | None:
        result = await self.db.execute(
            select(TestProjectModel)
            .options(
                selectinload(TestProjectModel.modules)
                .selectinload(TestModuleModel.test_cases)
                .selectinload(TestCaseModel.test_steps)
            )
            .where(TestProjectModel.id == project_id)
        )
        return result.scalar_one_or_none()

    async def create_project(self, schema: TestProjectCreateSchema) -> TestProjectModel:
        project = TestProjectModel(
            name=schema.name,
            description=schema.description,
            status=schema.status,
            tags=schema.tags,
        )
        self.db.add(project)
        await self.db.commit()
        return await self.get_project(project.id)  # type: ignore[return-value]

    async def update_project(
        self, project_id: str, schema: TestProjectUpdateSchema
    ) -> TestProjectModel | None:
        project = await self.db.get(TestProjectModel, project_id)
        if project is None:
            return None
        if schema.name is not None:
            project.name = schema.name
        if schema.description is not None:
            project.description = schema.description
        if schema.status is not None:
            project.status = schema.status
        if schema.tags is not None:
            project.tags = schema.tags
        await self.db.commit()
        return await self.get_project(project_id)

    async def delete_project(self, project_id: str) -> bool:
        project = await self.db.get(TestProjectModel, project_id)
        if project is None:
            return False
        await self.db.delete(project)
        await self.db.commit()
        return True

    async def create_module(
        self, project_id: str, schema: TestModuleCreateSchema
    ) -> TestModuleModel:
        project = await self.db.get(TestProjectModel, project_id)
        if project is None:
            raise TestConfigurationError("Project not found")
        module = TestModuleModel(
            project_id=project_id,
            name=schema.name,
            description=schema.description,
            status=schema.status,
            tags=schema.tags,
        )
        self.db.add(module)
        await self.db.commit()
        await self.db.refresh(module)
        return module

    async def update_module(
        self, module_id: str, schema: TestModuleUpdateSchema
    ) -> TestModuleModel | None:
        module = await self.db.get(TestModuleModel, module_id)
        if module is None:
            return None
        if schema.name is not None:
            module.name = schema.name
        if schema.description is not None:
            module.description = schema.description
        if schema.status is not None:
            module.status = schema.status
        if schema.tags is not None:
            module.tags = schema.tags
        await self.db.commit()
        await self.db.refresh(module)
        return module

    async def delete_module(self, module_id: str) -> bool:
        module = await self.db.get(TestModuleModel, module_id)
        if module is None:
            return False
        await self.db.delete(module)
        await self.db.commit()
        return True

    async def create_test_case(
        self, module_id: str, schema: TestCaseCreateSchema
    ) -> TestCaseModel:
        module = await self.db.get(TestModuleModel, module_id)
        if module is None:
            raise TestConfigurationError("Module not found")
        test_case = TestCaseModel(
            module_id=module_id,
            project_id=schema.project_id or module.project_id,
            testing_type_id=schema.testing_type_id,
            name=schema.name,
            description=schema.description,
            status=schema.status,
            test_type=schema.test_type,
            priority=schema.priority,
            execution_mode=schema.execution_mode,
            platforms=schema.platforms,
            tags=schema.tags,
            default_variables=schema.default_variables,
        )
        self.db.add(test_case)
        await self.db.commit()
        await self.db.refresh(test_case)
        return test_case

    async def update_test_case(
        self, case_id: str, schema: TestCaseUpdateSchema
    ) -> TestCaseModel | None:
        test_case = await self.db.get(TestCaseModel, case_id)
        if test_case is None:
            return None
        if schema.name is not None:
            test_case.name = schema.name
        if schema.description is not None:
            test_case.description = schema.description
        if schema.status is not None:
            test_case.status = schema.status
        if schema.test_type is not None:
            test_case.test_type = schema.test_type
        if schema.priority is not None:
            test_case.priority = schema.priority
        if schema.execution_mode is not None:
            test_case.execution_mode = schema.execution_mode
        if schema.platforms is not None:
            test_case.platforms = schema.platforms
        if schema.tags is not None:
            test_case.tags = schema.tags
        if schema.default_variables is not None:
            test_case.default_variables = schema.default_variables
        if schema.project_id is not None:
            test_case.project_id = schema.project_id
        if schema.testing_type_id is not None:
            test_case.testing_type_id = schema.testing_type_id
        await self.db.commit()
        return await self.get_case(case_id)

    async def get_case(self, case_id: str) -> TestCaseModel | None:
        result = await self.db.execute(
            select(TestCaseModel)
            .options(selectinload(TestCaseModel.test_steps))
            .where(TestCaseModel.id == case_id)
        )
        return result.scalar_one_or_none()

    async def delete_test_case(self, case_id: str) -> bool:
        test_case = await self.db.get(TestCaseModel, case_id)
        if test_case is None:
            return False
        await self.db.delete(test_case)
        await self.db.commit()
        return True

    async def create_test_step(
        self, case_id: str, schema: TestStepCreateSchema
    ) -> TestStepModel:
        test_case = await self.db.get(TestCaseModel, case_id)
        if test_case is None:
            raise TestConfigurationError("Test case not found")
        if schema.step_order is None:
            order_result = await self.db.execute(
                select(func.max(TestStepModel.step_order)).where(TestStepModel.test_case_id == case_id)
            )
            next_order = (order_result.scalar() or 0) + 1
        else:
            next_order = schema.step_order
        step = TestStepModel(
            test_case_id=case_id,
            step_order=next_order,
            name=schema.name,
            description=schema.description,
            # Normalized fields
            action_type=schema.action_type or schema.intent,
            page_id=schema.page_id,
            page_element_id=schema.page_element_id,
            api_endpoint_id=schema.api_endpoint_id,
            input_value=schema.input_value,
            expected_result=schema.expected_result,
            assertion_type=schema.assertion_type,
            secondary_action=schema.secondary_action,
            secondary_value=schema.secondary_value,
            # Legacy fields
            intent=schema.intent,
            target=schema.target,
            test_data=schema.test_data,
            tags=schema.tags,
            bindings=schema.bindings,
            is_enabled=schema.is_enabled,
        )
        self.db.add(step)
        await self.db.commit()
        await self.db.refresh(step)
        return step

    async def update_test_step(
        self, step_id: str, schema: TestStepUpdateSchema
    ) -> TestStepModel | None:
        step = await self.db.get(TestStepModel, step_id)
        if step is None:
            return None
        if schema.name is not None:
            step.name = schema.name
        if schema.description is not None:
            step.description = schema.description
        if schema.step_order is not None:
            step.step_order = schema.step_order
        # Normalized fields
        if schema.action_type is not None:
            step.action_type = schema.action_type
        if schema.page_id is not None:
            step.page_id = schema.page_id
        if schema.page_element_id is not None:
            step.page_element_id = schema.page_element_id
        if schema.api_endpoint_id is not None:
            step.api_endpoint_id = schema.api_endpoint_id
        if schema.input_value is not None:
            step.input_value = schema.input_value
        if schema.assertion_type is not None:
            step.assertion_type = schema.assertion_type
        if schema.secondary_action is not None:
            step.secondary_action = schema.secondary_action
        if schema.secondary_value is not None:
            step.secondary_value = schema.secondary_value
        # Legacy fields
        if schema.intent is not None:
            step.intent = schema.intent
            if not schema.action_type:
                step.action_type = schema.intent
        if schema.target is not None:
            step.target = schema.target
        if schema.expected_result is not None:
            step.expected_result = schema.expected_result
        if schema.test_data is not None:
            step.test_data = schema.test_data
        if schema.tags is not None:
            step.tags = schema.tags
        if schema.bindings is not None:
            step.bindings = schema.bindings
        if schema.is_enabled is not None:
            step.is_enabled = schema.is_enabled
        await self.db.commit()
        await self.db.refresh(step)
        return step

    async def delete_test_step(self, step_id: str) -> bool:
        step = await self.db.get(TestStepModel, step_id)
        if step is None:
            return False
        await self.db.delete(step)
        await self.db.commit()
        return True
