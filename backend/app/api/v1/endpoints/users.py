from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter()


@router.get("/", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return list(result.scalars().all())


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    role = user_in.role if isinstance(user_in.role, UserRole) else UserRole(user_in.role)
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        is_active=user_in.is_active,
        is_superuser=role == UserRole.ADMIN,
        role=role.value,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_in.email is not None:
        existing = await db.execute(select(User).where(User.email == user_in.email, User.id != user_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = user_in.email

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.password:
        user.hashed_password = get_password_hash(user_in.password)
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.role is not None:
        role = user_in.role if isinstance(user_in.role, UserRole) else UserRole(user_in.role)
        user.role = role.value
        user.is_superuser = role == UserRole.ADMIN

    await db.flush()
    await db.refresh(user)
    return user
